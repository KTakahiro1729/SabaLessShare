import { jest } from '@jest/globals';

// Mock argon2-browser to avoid loading WASM
jest.unstable_mockModule('argon2-browser', () => ({
  default: {
    hash: async ({ pass, salt }) => {
      const data = new Uint8Array([
        ...new TextEncoder().encode(pass),
        ...new Uint8Array(salt)
      ]);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return { hash: new Uint8Array(hash) };
    },
    ArgonType: { Argon2id: 2 }
  }
}));

const { createShareLink, receiveSharedData } = await import('../src/index.js');
const { arrayBufferToBase64, base64ToArrayBuffer } = await import('../src/crypto.js');
const { PayloadTooLargeError } = await import('../src/errors.js');

// --- テスト用のモックハンドラ ---
const MOCK_BASE_URL = 'https://example.com/demo/';
const cloudStorage = new Map();
const simpleStorage = new Map();

const mockUploadHandler = async (data, mode) => {
    if (mode === 'simple') {
        const id = `simple-${crypto.randomUUID()}`;
        simpleStorage.set(id, data);
        return `${MOCK_BASE_URL}?epayload=${id}`;
    } else { // cloud
        const fileId = `mock-file-${crypto.randomUUID()}`;
        cloudStorage.set(fileId, data);
        return fileId;
    }
};

const mockShortenUrlHandler = async (url) => url; // テストでは短縮しない

const mockDownloadHandler = async (idOrUrl) => {
    if (idOrUrl.startsWith('http')) { // simple
        const url = new URL(idOrUrl);
        const id = url.searchParams.get('epayload');
        if (!simpleStorage.has(id)) throw new Error('Mock simple data not found');
        return simpleStorage.get(id);
    } else { // cloud
        if (!cloudStorage.has(idOrUrl)) throw new Error('Mock file not found');
        return cloudStorage.get(idOrUrl);
    }
};

describe('SabaLessShare Integration Tests', () => {

    const originalText = 'SabaLessShareの統合テストです！';
    const originalData = new TextEncoder().encode(originalText);
    const password = 'test-password';

    // テストケースをパラメータ化して定義
    const testCases = [
        { mode: 'simple', usePass: false, useExpiry: false },
        { mode: 'simple', usePass: true, useExpiry: false },
        { mode: 'simple', usePass: true, useExpiry: true },
        { mode: 'cloud', usePass: false, useExpiry: false },
        { mode: 'cloud', usePass: true, useExpiry: false },
        { mode: 'cloud', usePass: true, useExpiry: true },
    ];

    test.each(testCases)('E2E Test: mode=$mode, password=$usePass, expiry=$useExpiry', async ({ mode, usePass, useExpiry }) => {
        // 1. リンク生成
        const link = await createShareLink({
            data: originalData,
            mode: mode,
            uploadHandler: (data) => mockUploadHandler(data, mode),
            shortenUrlHandler: mockShortenUrlHandler,
            password: usePass ? password : undefined,
            expiresInDays: useExpiry ? 1 : undefined,
        });

        expect(link).toContain('?p=');
        expect(link).toContain('#');
        expect(link).toMatch(/k=[^&]+/);
        expect(link).toMatch(/i=[^&]+/);
        expect(link).toMatch(/m=[sc]/);

        // 2. 受信シミュレーション
        const mockLocation = new URL(link);
        
        const received = await receiveSharedData({
            location: mockLocation,
            downloadHandler: mockDownloadHandler,
            passwordPromptHandler: async () => usePass ? password : null,
        });
        
        // 3. 結果検証
        expect(new TextDecoder().decode(received)).toBe(originalText);
    });

    it('期限切れリンクでエラーをスローすること', async () => {
        const link = await createShareLink({
            data: originalData,
            mode: 'simple',
            uploadHandler: (data) => mockUploadHandler(data, 'simple'),
            shortenUrlHandler: mockShortenUrlHandler,
            expiresInDays: -1,
        });

        // 意図的に待機
        await new Promise(resolve => setTimeout(resolve, 10));

        const mockLocation = new URL(link);

        await expect(receiveSharedData({
            location: mockLocation,
            downloadHandler: mockDownloadHandler,
            passwordPromptHandler: async () => null,
        })).rejects.toThrow('This link has expired.');
    });

    it('旧形式のURLでも復号できること', async () => {
        const link = await createShareLink({
            data: originalData,
            mode: 'simple',
            uploadHandler: (data) => mockUploadHandler(data, 'simple'),
            shortenUrlHandler: mockShortenUrlHandler,
            password: password,
            expiresInDays: 1,
        });

        const urlObj = new URL(link);
        const qp = urlObj.searchParams;
        qp.set('epayload', qp.get('p'));
        qp.delete('p');
        urlObj.search = '?' + qp.toString();

        const fp = new URLSearchParams(urlObj.hash.substring(1));
        fp.set('key', fp.get('k'));
        fp.delete('k');
        fp.set('iv', fp.get('i'));
        fp.delete('i');
        if (fp.has('s')) {
            fp.set('salt', fp.get('s'));
            fp.delete('s');
        }
        if (fp.has('x')) {
            fp.set('expdate', fp.get('x'));
            fp.delete('x');
        }
        fp.set('mode', fp.get('m') === 'c' ? 'cloud' : 'simple');
        fp.delete('m');
        urlObj.hash = '#' + fp.toString();
        const oldLink = urlObj.toString();

        const mockLocation = new URL(oldLink);
        const received = await receiveSharedData({
            location: mockLocation,
            downloadHandler: mockDownloadHandler,
            passwordPromptHandler: async () => password,
        });
        expect(new TextDecoder().decode(received)).toBe(originalText);
    });

    it('有効期限の境界値を正しく判定すること', async () => {
        const link = await createShareLink({
            data: originalData,
            mode: 'simple',
            uploadHandler: (data) => mockUploadHandler(data, 'simple'),
            shortenUrlHandler: mockShortenUrlHandler,
            expiresInDays: 0,
        });
        const expdate = new URLSearchParams(new URL(link).hash.substring(1)).get('x');

        jest.useFakeTimers();
        jest.setSystemTime(new Date(expdate + 'T23:59:59.999Z'));
        const received = await receiveSharedData({
            location: new URL(link),
            downloadHandler: mockDownloadHandler,
            passwordPromptHandler: async () => null,
        });
        expect(new TextDecoder().decode(received)).toBe(originalText);

        jest.setSystemTime(new Date(new Date(expdate + 'T23:59:59.999Z').getTime() + 1));
        await expect(receiveSharedData({
            location: new URL(link),
            downloadHandler: mockDownloadHandler,
            passwordPromptHandler: async () => null,
        })).rejects.toThrow('This link has expired.');
        jest.useRealTimers();
    });

    it('simpleモードでペイロードが大きすぎる場合にエラーをスローすること', async () => {
        const bigData = crypto.getRandomValues(new Uint8Array(10000));
        const bigUploadHandler = async () => 'x'.repeat(8000);

        await expect(createShareLink({
            data: bigData,
            mode: 'simple',
            uploadHandler: bigUploadHandler,
            shortenUrlHandler: mockShortenUrlHandler,
        })).rejects.toThrow(PayloadTooLargeError);
    });
});
