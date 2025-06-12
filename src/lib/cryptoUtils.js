import argon2 from 'argon2-browser';

// テキストとArrayBuffer間の変換用エンコーダ/デコーダ
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * ArrayBufferをBase64URL形式の文字列にエンコードします。
 * @param {ArrayBuffer} buffer - エンコードするArrayBuffer
 * @returns {string} Base64URL形式の文字列
 */
function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  // Base64エンコードし、URLセーフな文字に置換
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL形式の文字列をArrayBufferにデコードします。
 * @param {string} base64urlString - デコードするBase64URL形式の文字列
 * @returns {ArrayBuffer} デコードされたArrayBuffer
 */
function base64urlDecode(base64urlString) {
  // Base64に変換し、パディングを追加
  const base64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const paddedBase64 = pad ? base64 + '===='.slice(pad) : base64;
  const binaryString = atob(paddedBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 256ビットのAES-GCMキーを生成します。
 * @returns {Promise<CryptoKey>} 生成されたCryptoKeyオブジェクト
 */
async function generateAESGCMKey() {
  return window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256, // 256ビットキー
    },
    true, // エクスポート可能
    ['encrypt', 'decrypt']
  );
}

/**
 * CryptoKeyをraw (生) 形式のArrayBufferとしてエクスポートします。
 * @param {CryptoKey} key - エクスポートするCryptoKeyオブジェクト
 * @returns {Promise<ArrayBuffer>} raw形式のキーデータ
 */
async function exportAESGCMKeyRaw(key) {
  return window.crypto.subtle.exportKey('raw', key);
}

/**
 * raw形式のArrayBufferからCryptoKeyをインポートします。
 * @param {ArrayBuffer} rawKey - raw形式のキーデータ
 * @returns {Promise<CryptoKey>} インポートされたCryptoKeyオブジェクト
 */
async function importAESGCMKeyRaw(rawKey) {
  return window.crypto.subtle.importKey(
    'raw',
    rawKey,
    {
      name: 'AES-GCM',
    },
    true, // エクスポート可能
    ['encrypt', 'decrypt']
  );
}

/**
 * データをAES-256-GCMで暗号化します。
 * @param {CryptoKey} key - 暗号化キー
 * @param {string} data - 暗号化する文字列データ
 * @returns {Promise<{ iv: string, ciphertext: string }>} IVと暗号文 (両方Base64URL形式)
 */
async function encryptAESGCM(key, data) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12バイトのIVを生成 (推奨)
  const encodedData = textEncoder.encode(data); // データをUint8Arrayに変換

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encodedData
  );

  return {
    iv: base64urlEncode(iv.buffer),
    ciphertext: base64urlEncode(ciphertext),
  };
}

/**
 * データをAES-256-GCMで復号します。
 * @param {CryptoKey} key - 復号キー
 * @param {string} ivBase64Url - Base64URL形式のIV
 * @param {string} ciphertextBase64Url - Base64URL形式の暗号文
 * @returns {Promise<string>} 復号された文字列データ
 */
async function decryptAESGCM(key, ivBase64Url, ciphertextBase64Url) {
  const iv = base64urlDecode(ivBase64Url);
  const ciphertext = base64urlDecode(ciphertextBase64Url);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    ciphertext
  );

  return textDecoder.decode(decrypted);
}

/**
 * 暗号学的に安全なランダムなソルトを生成します。
 * @param {number} length - ソルトのバイト長
 * @returns {ArrayBuffer} 生成されたソルトのArrayBuffer
 */
function generateSalt(length = 16) {
  return window.crypto.getRandomValues(new Uint8Array(length)).buffer;
}

/**
 * パスワードとソルトから鍵導出キー (KEK) を導出します (Argon2idを使用)。
 * @param {string} password - ユーザーのパスワード
 * @param {ArrayBuffer} salt - ソルトのArrayBuffer
 * @returns {Promise<CryptoKey>} 導出されたKEKのCryptoKeyオブジェクト
 */
async function deriveKeyFromPassword(password, salt) {
  // Argon2idでハッシュを生成し、それをKEKとしてインポートする
  const hashResult = await argon2.hash({
    pass: password,
    salt: new Uint8Array(salt),
    time: 2, // Iterations
    mem: 16 * 1024, // Memory in KiB (16MB)
    hashLen: 32, // 256 bits (32 bytes)
    parallelism: 1,
    type: argon2.ArgonType.Argon2id,
  });

  // Argon2の結果から生ハッシュ (ArrayBuffer) を取得
  const rawKek = hashResult.hash;

  // この生ハッシュをAES-GCMキーとしてインポート
  return window.crypto.subtle.importKey(
    'raw',
    rawKek,
    {
      name: 'AES-GCM',
    },
    false, // エクスポート不可 (KEKはセッション中にのみ使用されるため)
    ['encrypt', 'decrypt']
  );
}

export {
  base64urlEncode,
  base64urlDecode,
  generateAESGCMKey,
  exportAESGCMKeyRaw,
  importAESGCMKeyRaw,
  encryptAESGCM,
  decryptAESGCM,
  generateSalt,
  deriveKeyFromPassword,
};
