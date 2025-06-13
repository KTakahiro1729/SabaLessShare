import {
  generateDek, generateKek, generateSalt, encryptData, decryptData,
  exportKeyToString, importKeyFromString, arrayBufferToBase64, base64ToArrayBuffer
} from './crypto.js';
import * as pako from 'pako';
import { parseShareUrl } from './url.js';
import { InvalidLinkError, ExpiredLinkError, PasswordRequiredError } from './errors.js';

/**
 * データを暗号化し、共有用の短縮URLを生成する
 * @param {{
 * data: ArrayBuffer,
 * uploadHandler: (data: ArrayBuffer) => Promise<string>,
 * shortenUrlHandler: (url: string) => Promise<string>,
 * mode: 'simple' | 'cloud',
 * password?: string,
 * expiresIn?: number
 * }} options
 * @returns {Promise<string>} 最終的な共有URL
 */
export async function createShareLink({ data, mode, uploadHandler, shortenUrlHandler, password, expiresIn }) {
  const dek = await generateDek();
  const expdate = expiresIn ? new Date(Date.now() + expiresIn) : null;
  const aad = expdate ? new TextEncoder().encode(expdate.toISOString()) : undefined;

  let payloadToEncrypt;
  if (mode === 'simple') {
    payloadToEncrypt = pako.gzip(new Uint8Array(data)).buffer;
  } else {
    payloadToEncrypt = data;
  }

  const { ciphertext, iv } = await encryptData(dek, payloadToEncrypt, aad);

  const payloadUrl = await uploadHandler(ciphertext);

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
    iv: arrayBufferToBase64(iv),
    key: keyString
  });
  if (salt) params.set('salt', arrayBufferToBase64(salt));
  if (expdate) params.set('expdate', expdate.toISOString());
  params.set('mode', mode);

  const accessURL = await shortenUrlHandler(payloadUrl);

  return `${accessURL}#${params.toString()}`;
}

/**
 * 共有URLからデータを復号して取得する
 * @param {{
 * location: Location,
 * downloadHandler: (url: string) => Promise<ArrayBuffer>,
 * passwordPromptHandler: () => Promise<string|null>
 * }} options
 * @returns {Promise<ArrayBuffer>} 復号されたデータ
 */
export async function receiveSharedData({ location, downloadHandler, passwordPromptHandler }) {
  const params = parseShareUrl(location);
  if (!params) throw new InvalidLinkError('Not a valid share link.');

  const { payloadUrl, key, salt, expdate, iv: ivBase64, mode } = params;

  if (expdate && new Date() > new Date(expdate)) {
    throw new ExpiredLinkError('This link has expired.');
  }

  let dek;
  if (salt) {
    const password = await passwordPromptHandler();
    if (!password) throw new PasswordRequiredError('Password is required but was not provided.');
    const kek = await generateKek(password, base64ToArrayBuffer(salt));
    const [encCipher, encIv] = key.split('.');
    const rawDek = await decryptData(kek, {
      ciphertext: base64ToArrayBuffer(encCipher),
      iv: new Uint8Array(base64ToArrayBuffer(encIv))
    });
    dek = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  } else {
    dek = await importKeyFromString(key);
  }

  const encryptedPayload = await downloadHandler(payloadUrl);
  const aad = expdate ? new TextEncoder().encode(expdate) : undefined;

  const decryptedPayload = await decryptData(dek, {
    ciphertext: encryptedPayload,
    iv: new Uint8Array(base64ToArrayBuffer(ivBase64)),
    additionalData: aad
  });

  if (mode === 'simple') {
    return pako.ungzip(new Uint8Array(decryptedPayload)).buffer;
  }

  return decryptedPayload;
}


