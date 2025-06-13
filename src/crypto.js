import { DecryptionError } from './errors.js';

const cryptoObj = globalThis.crypto;

let argon2Promise;
async function getArgon2() {
  if (!argon2Promise) {
    if (typeof process !== 'undefined' && process.versions?.node) {
      globalThis.loadArgon2WasmBinary = async () => {
        const fs = await import('fs');
        const path = await import('path');
        const url = await import('url');
        const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
        const wasmPath = path.resolve(
          __dirname,
          '../node_modules/argon2-browser/dist/argon2.wasm'
        );
        return new Uint8Array(fs.readFileSync(wasmPath));
      };
    }
    argon2Promise = import('argon2-browser/dist/argon2-bundled.min.js').then(
      (m) => m.default
    );
  }
  return argon2Promise;
}

/**
 * ArrayBufferをBase64文字列に変換する
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * Base64文字列をArrayBufferに変換する
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Saltを生成する
 * @param {number} length
 * @returns {Uint8Array}
 */
export function generateSalt(length = 16) {
  return cryptoObj.getRandomValues(new Uint8Array(length));
}

/**
 * データ暗号化キー (DEK) を生成する
 * @returns {Promise<CryptoKey>}
 */
export async function generateDek() {
  return cryptoObj.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * 鍵暗号化キー (KEK) をパスワードとSaltから導出する
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
export async function generateKek(password, salt) {
  if (!password || !salt) throw new Error('Password and salt are required for KEK generation.');
  const argon2 = await getArgon2();
  const result = await argon2.hash({
    pass: password,
    salt: salt,
    time: 2,
    mem: 19456,
    hashLen: 32,
    parallelism: 1,
    type: argon2.ArgonType.Argon2id,
  });
  return cryptoObj.subtle.importKey('raw', result.hash.buffer, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/**
 * DEKを文字列としてエクスポートする
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function exportKeyToString(key) {
  const raw = await cryptoObj.subtle.exportKey('raw', key);
  return arrayBufferToBase64(raw);
}

/**
 * 文字列からDEKをインポートする
 * @param {string} keyString
 * @returns {Promise<CryptoKey>}
 */
export async function importKeyFromString(keyString) {
  const raw = base64ToArrayBuffer(keyString);
  return cryptoObj.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/**
 * AES-GCMでデータを暗号化する
 * @param {CryptoKey} key
 * @param {ArrayBuffer} data
 * @param {Uint8Array} [additionalData] - AAD
 * @returns {Promise<{ciphertext: ArrayBuffer, iv: Uint8Array}>}
 */
export async function encryptData(key, data, additionalData) {
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const algorithm = { name: 'AES-GCM', iv };
  if (additionalData) {
    algorithm.additionalData = additionalData;
  }
  const ciphertext = await cryptoObj.subtle.encrypt(algorithm, key, data);
  return { ciphertext, iv };
}

/**
 * AES-GCMでデータを復号する
 * @param {CryptoKey} key
 * @param {{ciphertext: ArrayBuffer, iv: Uint8Array, additionalData?: Uint8Array}} payload
 * @returns {Promise<ArrayBuffer>}
 */
export async function decryptData(key, { ciphertext, iv, additionalData }) {
  try {
    const algorithm = { name: 'AES-GCM', iv };
    if (additionalData) {
      algorithm.additionalData = additionalData;
    }
    return await cryptoObj.subtle.decrypt(algorithm, key, ciphertext);
  } catch (error) {
    throw new DecryptionError('Failed to decrypt data. The key may be incorrect or the data may be corrupted.');
  }
}
