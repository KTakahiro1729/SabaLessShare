import {
  generateDek, generateKek, generateSalt, encryptData, decryptData,
  exportKeyToString, importKeyFromString, arrayBufferToBase64, base64ToArrayBuffer
} from './crypto.js';
import * as pako from 'pako';
import { parseShareUrl } from './url.js';
import { InvalidLinkError, ExpiredLinkError, PasswordRequiredError, PayloadTooLargeError } from './errors.js';

// URL length safety limit for simple mode's epayload (pre-encoding)
const DEFAULT_SIMPLE_MODE_PAYLOAD_LIMIT = 7700;

/**
 * データを暗号化し、共有用の短縮URLを生成する
 * @param {{
 * data: ArrayBuffer,
 * uploadHandler: (data: { ciphertext: ArrayBuffer, iv: Uint8Array }) => Promise<string>,
 * shortenUrlHandler: (url: string) => Promise<string>,
 * mode: 'simple' | 'cloud',
 * password?: string,
 * expiresInDays?: number,
 * simpleModePayloadLimit?: number
 * }} options
 * @returns {Promise<string>} 最終的な共有URL
 */
export async function createShareLink({
  data,
  mode,
  uploadHandler,
  shortenUrlHandler,
  password,
  expiresInDays,
  simpleModePayloadLimit = DEFAULT_SIMPLE_MODE_PAYLOAD_LIMIT
}) {
  const dek = await generateDek();
  const expdate = Number.isFinite(expiresInDays) ? new Date(Date.now() + expiresInDays * 86400000) : null;
  const expStr = expdate ? expdate.toISOString().slice(0, 10) : null;
  const aad = expStr ? new TextEncoder().encode(expStr) : undefined;

  let payloadToEncrypt;
  let encPayload;
  let usedIv;
  if (mode === 'simple') {
    payloadToEncrypt = pako.gzip(new Uint8Array(data)).buffer;
    ({ ciphertext: encPayload, iv: usedIv } = await encryptData(dek, payloadToEncrypt, aad));
  } else {
    payloadToEncrypt = data;
    const uploadData = await encryptData(dek, payloadToEncrypt, aad);
    const fileId = await uploadHandler(uploadData);
    const encodedId = new TextEncoder().encode(fileId);
    ({ ciphertext: encPayload, iv: usedIv } = await encryptData(dek, encodedId, aad));
  }

  let salt = null;
  let keyString;

  if (password) {
    salt = generateSalt();
    const kek = await generateKek(password, salt);
    const rawDek = await crypto.subtle.exportKey('raw', dek);
    const encDek = await encryptData(kek, rawDek);
    keyString = `${arrayBufferToBase64(encDek.ciphertext)}.${arrayBufferToBase64(encDek.iv)}`;
  } else {
    keyString = await exportKeyToString(dek);
  }

  const params = new URLSearchParams({
    i: arrayBufferToBase64(usedIv),
    k: keyString
  });
  if (salt) params.set('s', arrayBufferToBase64(salt));
  if (expStr) params.set('x', expStr);
  const modeMap = { simple: 's', cloud: 'c' };
  params.set('m', modeMap[mode] || 's');

  const epayload = arrayBufferToBase64(encPayload);

  if (mode === 'simple' && epayload.length > simpleModePayloadLimit) {
    throw new PayloadTooLargeError('Payload too large for simple mode. Please use Cloud Mode instead.');
  }

  const base = typeof location !== 'undefined' ? location.href.split('#')[0].split('?')[0] : '';
  const paramName = mode === 'simple' ? 'data' : 'p';
  const accessURL = await shortenUrlHandler(`${base}?${paramName}=${encodeURIComponent(epayload)}`);

  return `${accessURL}#${params.toString()}`;
}

/**
 * 共有URLからデータを復号して取得する
 * @param {{
 * location: Location,
 * downloadHandler: (id: string) => Promise<{ ciphertext: ArrayBuffer, iv: Uint8Array }>,
 * passwordPromptHandler: () => Promise<string|null>
 * }} options
 * @returns {Promise<ArrayBuffer>} 復号されたデータ
 */
export async function receiveSharedData({ location, downloadHandler, passwordPromptHandler }) {
  try {
    const params = parseShareUrl(location);
    if (!params) throw new InvalidLinkError('Not a valid share link.');

    const { key, salt, expdate, iv: ivBase64, mode } = params;
    if (mode === 'cloud') {
      if (typeof downloadHandler !== 'function') {
        throw new Error('downloadHandler is required for cloud mode');
      }
    }

    const queryParams = new URLSearchParams(location.search);

    if (!params.epayload) {
      throw new InvalidLinkError(`Invalid ${mode} mode link: missing data parameter`);
    }

    if (expdate && new Date() > new Date(expdate + 'T23:59:59.999Z')) {
      throw new ExpiredLinkError('This link has expired.');
    }

    let dek;
    if (salt) {
      const password = await passwordPromptHandler();
      if (!password) throw new PasswordRequiredError('Password is required but was not provided.');
      const kek = await generateKek(password, new Uint8Array(base64ToArrayBuffer(salt)));
      const [encCipher, encIv] = key.split('.');
      const rawDek = await decryptData(kek, {
        ciphertext: base64ToArrayBuffer(encCipher),
        iv: new Uint8Array(base64ToArrayBuffer(encIv))
      });
      dek = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    } else {
      dek = await importKeyFromString(key);
    }

    const aad = expdate ? new TextEncoder().encode(expdate) : undefined;

    const encPayloadBuffer = base64ToArrayBuffer(params.epayload);

    if (mode === 'simple') {
      const decryptedPayload = await decryptData(dek, {
        ciphertext: encPayloadBuffer,
        iv: new Uint8Array(base64ToArrayBuffer(ivBase64)),
        additionalData: aad,
      });
      return pako.ungzip(new Uint8Array(decryptedPayload)).buffer;
    }

    const fileIdBuffer = await decryptData(dek, {
      ciphertext: encPayloadBuffer,
      iv: new Uint8Array(base64ToArrayBuffer(ivBase64)),
      additionalData: aad,
    });
    const fileId = new TextDecoder().decode(fileIdBuffer);

    const downloadData = await downloadHandler(fileId);

    const decryptedPayload = await decryptData(dek, {
      ciphertext: downloadData.ciphertext,
      iv: downloadData.iv,
      additionalData: aad,
    });

    return decryptedPayload;
  } finally {
    if (typeof history !== 'undefined') {
      const base = location.href.split('#')[0].split('?')[0];
      history.replaceState(null, '', base);
    }
  }
}


