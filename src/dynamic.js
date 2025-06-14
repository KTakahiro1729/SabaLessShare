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
 * @typedef {Object} StorageAdapter
 * @property {(data: any) => Promise<string>} create
 * @property {(id: string) => Promise<any>} read
 * @property {(id: string, data: any) => Promise<void>} update
 */

/**
 * Reconstruct Data Encryption Key from stored key info.
 * @param {string} key - Base64 string or encrypted payload
 * @param {string|null} salt - Salt in base64 if password protected
 * @param {string|null} password - Password used when salt is provided
 * @returns {Promise<CryptoKey>} AES-GCM key for data encryption
 * @throws {PasswordRequiredError} When salt is provided but password is missing
 * @private
 */
async function _reconstructDek(key, salt, password) {
  if (salt) {
    if (!password) {
      throw new PasswordRequiredError('Password is required but was not provided.');
    }
    const kek = await generateKek(password, new Uint8Array(base64ToArrayBuffer(salt)));
    const [encCipher, encIv] = key.split('.');
    const rawDek = await decryptData(kek, {
      ciphertext: base64ToArrayBuffer(encCipher),
      iv: new Uint8Array(base64ToArrayBuffer(encIv))
    });
    return crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  return importKeyFromString(key);
}

/**
 * Create a dynamic share link using a storage adapter.
 * @param {{
 *   data: ArrayBuffer,
 *   adapter: StorageAdapter,
 *   password?: string,
 *   expiresInDays?: number
 * }} options
 * @returns {Promise<{shareLink: string, pointerFileId: string, key: string, salt: string|null}>}
 */
export async function createDynamicLink({ data, adapter, password, expiresInDays }) {
  if (!data) throw new Error("Missing required option 'data'");
  if (!adapter || typeof adapter.create !== 'function') {
    throw new Error("Missing required option 'adapter' with 'create' method");
  }

  const dek = await generateDek();

  const encData = await encryptData(dek, data);
  let dataFileId;
  try {
    dataFileId = await adapter.create(encData);
  } catch (err) {
    throw new Error(`Storage adapter failed during 'create': ${err.message}`);
  }

  const pointerContent = new TextEncoder().encode(dataFileId);
  let pointerFileId;
  try {
    pointerFileId = await adapter.create(pointerContent);
  } catch (err) {
    throw new Error(`Storage adapter failed during 'create': ${err.message}`);
  }

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

  const params = new URLSearchParams({ i: arrayBufferToBase64(iv), k: keyString, m: 'd' });
  if (salt) params.set('s', arrayBufferToBase64(salt));
  if (Number.isFinite(expiresInDays)) {
    const expdate = new Date(Date.now() + expiresInDays * 86400000).toISOString().slice(0,10);
    params.set('x', expdate);
  }

  const epayload = arrayBufferToBase64(encPayload);
  const base = typeof location !== 'undefined' ? location.href.split('#')[0].split('?')[0] : '';
  const shareLink = `${base}?p=${encodeURIComponent(epayload)}#${params.toString()}`;

  return { shareLink, pointerFileId, key: keyString, salt: salt ? arrayBufferToBase64(salt) : null };
}

/**
 * Receive dynamic shared data.
 * @param {{
 *   location: Location,
 *   adapter: StorageAdapter,
 *   passwordPromptHandler: () => Promise<string|null>
 * }} options
 * @returns {Promise<ArrayBuffer>}
 */
export async function receiveDynamicData({ location, adapter, passwordPromptHandler }) {
  if (!location) throw new Error("Missing required option 'location'");
  if (!adapter || typeof adapter.read !== 'function') {
    throw new Error("Missing required option 'adapter' with 'read' method");
  }
  if (typeof passwordPromptHandler !== 'function') {
    throw new Error("Missing required option 'passwordPromptHandler'");
  }

  try {
    const params = parseShareUrl(location);
    if (!params || params.mode !== 'dynamic') throw new InvalidLinkError('Not a valid dynamic share link.');

    const { key, salt, iv, expdate } = params;
    if (expdate && new Date() > new Date(expdate)) {
      throw new ExpiredLinkError('This link has expired.');
    }

    let password = null;
    if (salt) {
      password = await passwordPromptHandler();
    }
    const dek = await _reconstructDek(key, salt, password);

    const payloadBuffer = base64ToArrayBuffer(params.epayload);
    const pointerBuffer = await decryptData(dek, { ciphertext: payloadBuffer, iv: new Uint8Array(base64ToArrayBuffer(iv)) });
    const pointerFileId = new TextDecoder().decode(pointerBuffer);

    let pointerData;
    try {
      pointerData = await adapter.read(pointerFileId);
    } catch (err) {
      throw new Error(`Storage adapter failed during 'read': ${err.message}`);
    }
    const dataFileId = new TextDecoder().decode(pointerData);

    let encryptedData;
    try {
      encryptedData = await adapter.read(dataFileId);
    } catch (err) {
      throw new Error(`Storage adapter failed during 'read': ${err.message}`);
    }
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
 *   adapter: StorageAdapter
 * }} options
 * @returns {Promise<string>} ID of the new data file
 */
export async function updateDynamicLink({ pointerFileId, newData, key, salt, password, adapter }) {
  if (!pointerFileId) throw new Error("Missing required option 'pointerFileId'");
  if (!newData) throw new Error("Missing required option 'newData'");
  if (!key) throw new Error("Missing required option 'key'");
  if (!adapter || typeof adapter.create !== 'function' || typeof adapter.update !== 'function') {
    throw new Error("Missing required option 'adapter' with 'create' and 'update' methods");
  }

  const dek = await _reconstructDek(key, salt, password || null);

  const encData = await encryptData(dek, newData);
  let dataFileId;
  try {
    dataFileId = await adapter.create(encData);
  } catch (err) {
    throw new Error(`Storage adapter failed during 'create': ${err.message}`);
  }
  try {
    await adapter.update(pointerFileId, new TextEncoder().encode(dataFileId));
  } catch (err) {
    throw new Error(`Storage adapter failed during 'update': ${err.message}`);
  }
  return dataFileId;
}
