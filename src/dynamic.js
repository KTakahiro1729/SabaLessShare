import {
  generateDek,
  generateKek,
  generateSalt,
  encryptData,
  decryptData,
  exportKeyToString,
  importKeyFromString,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './crypto.js';
import { parseShareUrl } from './url.js';
import { InvalidLinkError, ExpiredLinkError, PasswordRequiredError } from './errors.js';

/**
 * Create a dynamic share link using a storage adapter.
 * @param {{
 *   data: ArrayBuffer,
 *   adapter: { create(data: any): Promise<string> },
 *   password?: string,
 *   expiresIn?: number
 * }} options
 * @returns {Promise<{shareLink: string, pointerFileId: string, key: string, salt: string|null}>}
 */
export async function createDynamicLink({ data, adapter, password, expiresIn }) {
  const dek = await generateDek();

  const encData = await encryptData(dek, data);
  const dataFileId = await adapter.create(encData);

  const pointerContent = new TextEncoder().encode(dataFileId);
  const pointerFileId = await adapter.create(pointerContent);

  const { ciphertext: encPayload, iv } = await encryptData(dek, new TextEncoder().encode(pointerFileId));

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

  const params = new URLSearchParams({ iv: arrayBufferToBase64(iv), key: keyString, mode: 'dynamic' });
  if (salt) params.set('salt', arrayBufferToBase64(salt));
  if (expiresIn) {
    const expdate = new Date(Date.now() + expiresIn).toISOString();
    params.set('expdate', expdate);
  }

  const epayload = arrayBufferToBase64(encPayload);
  const base = typeof location !== 'undefined' ? location.href.split('#')[0].split('?')[0] : '';
  const shareLink = `${base}?epayload=${encodeURIComponent(epayload)}#${params.toString()}`;

  return { shareLink, pointerFileId, key: keyString, salt: salt ? arrayBufferToBase64(salt) : null };
}

/**
 * Receive dynamic shared data.
 * @param {{
 *   location: Location,
 *   adapter: { read(id: string): Promise<any> },
 *   passwordPromptHandler: () => Promise<string|null>
 * }} options
 * @returns {Promise<ArrayBuffer>}
 */
export async function receiveDynamicData({ location, adapter, passwordPromptHandler }) {
  try {
    const params = parseShareUrl(location);
    if (!params || params.mode !== 'dynamic') throw new InvalidLinkError('Not a valid dynamic share link.');

    const { key, salt, iv, expdate } = params;
    if (expdate && new Date() > new Date(expdate)) {
      throw new ExpiredLinkError('This link has expired.');
    }

    let dek;
    if (salt) {
      const password = await passwordPromptHandler();
      if (!password) throw new PasswordRequiredError('Password is required but was not provided.');
      const kek = await generateKek(password, new Uint8Array(base64ToArrayBuffer(salt)));
      const [encCipher, encIv] = key.split('.');
      const rawDek = await decryptData(kek, { ciphertext: base64ToArrayBuffer(encCipher), iv: new Uint8Array(base64ToArrayBuffer(encIv)) });
      dek = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    } else {
      dek = await importKeyFromString(key);
    }

    const payloadBuffer = base64ToArrayBuffer(params.epayload);
    const pointerBuffer = await decryptData(dek, { ciphertext: payloadBuffer, iv: new Uint8Array(base64ToArrayBuffer(iv)) });
    const pointerFileId = new TextDecoder().decode(pointerBuffer);

    const pointerData = await adapter.read(pointerFileId);
    const dataFileId = new TextDecoder().decode(pointerData);

    const encryptedData = await adapter.read(dataFileId);
    const result = await decryptData(dek, encryptedData);
    return result;
  } finally {
    if (typeof history !== 'undefined') {
      const base = location.href.split('#')[0].split('?')[0];
      history.replaceState(null, '', base);
    }
  }
}

/**
 * Update a dynamic share link with new data.
 * @param {{
 *   pointerFileId: string,
 *   newData: ArrayBuffer,
 *   key: string,
 *   salt: string|null,
 *   password?: string,
 *   adapter: { create(data: any): Promise<string>, update(id: string, data: any): Promise<void> }
 * }} options
 * @returns {Promise<string>} ID of the new data file
 */
export async function updateDynamicLink({ pointerFileId, newData, key, salt, password, adapter }) {
  let dek;
  if (salt) {
    if (!password) throw new PasswordRequiredError('Password is required but was not provided.');
    const kek = await generateKek(password, new Uint8Array(base64ToArrayBuffer(salt)));
    const [encCipher, encIv] = key.split('.');
    const rawDek = await decryptData(kek, { ciphertext: base64ToArrayBuffer(encCipher), iv: new Uint8Array(base64ToArrayBuffer(encIv)) });
    dek = await crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  } else {
    dek = await importKeyFromString(key);
  }

  const encData = await encryptData(dek, newData);
  const dataFileId = await adapter.create(encData);
  await adapter.update(pointerFileId, new TextEncoder().encode(dataFileId));
  return dataFileId;
}
