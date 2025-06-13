import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import fs from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';

// Ensure Web Crypto API is available
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.location = new URL('https://example.com/demo/');

// Provide wasm loader for argon2-browser in Node environment
const require = createRequire(import.meta.url);
const wasmPath = join(dirname(require.resolve('argon2-browser')), 'dist', 'argon2.wasm');
globalThis.loadArgon2WasmBinary = () => fs.promises.readFile(wasmPath).then(buf => new Uint8Array(buf));
