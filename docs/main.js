import { createShareLink, receiveSharedData } from '../src/index.js';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../src/crypto.js';

// --- ハンドラ定義 ---

// cloudモード用の簡易的なインメモリKVS
const cloudStorage = new Map();

const uploadHandler = async (data) => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    if (mode === 'simple') {
        const serialized = JSON.stringify({
            ciphertext: arrayBufferToBase64(data.ciphertext),
            iv: arrayBufferToBase64(data.iv)
        });
        return serialized;
    } else { // cloud
        const fileId = crypto.randomUUID();
        // 実際にはサーバーにアップロードするが、デモではMapに保存
        cloudStorage.set(fileId, data);
        console.log(`[Mock] Cloud Storageに保存: ID=${fileId}`);
        return fileId;
    }
};

const shortenUrlHandler = async (longUrl) => {
    // TinyURLのシンプルなAPIエンドポイントを利用
    const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
    console.log(`[TinyURL] 短縮リクエスト: ${apiUrl}`);
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`TinyURL API failed with status: ${response.status}`);
        }
        const shortUrl = await response.text();
        console.log(`[TinyURL] 短縮成功: ${longUrl} -> ${shortUrl}`);
        return shortUrl;
    } catch (error) {
        console.error("URL短縮に失敗しました。元のURLを返します。", error);
        // APIが失敗した場合はフォールバックとして元のURLを返す
        return longUrl;
    }
};

const downloadHandler = async (idOrUrl) => {
    // JSON文字列かファイルIDかを判定
    if (idOrUrl.trim().startsWith('{')) { // simple mode
        const { ciphertext, iv } = JSON.parse(idOrUrl);
        return {
            ciphertext: base64ToArrayBuffer(ciphertext),
            iv: new Uint8Array(base64ToArrayBuffer(iv))
        };
    } else { // cloud mode
        console.log(`[Mock] Cloud Storageから取得: ID=${idOrUrl}`);
        if (!cloudStorage.has(idOrUrl)) throw new Error("File not found in mock storage");
        return cloudStorage.get(idOrUrl);
    }
};

const passwordPromptHandler = async () => {
    return prompt("パスワードを入力してください:");
};


// --- UIロジック ---
const createView = document.getElementById('createView');
const receiveView = document.getElementById('receiveView');
const receivedDataEl = document.getElementById('receivedData');

async function handleReceive() {
    console.log("受信モードで起動します");
    createView.classList.add('hidden');
    receiveView.classList.remove('hidden');

    try {
        const decryptedData = await receiveSharedData({
            location: window.location,
            downloadHandler,
            passwordPromptHandler
        });
        const text = new TextDecoder().decode(decryptedData);
        receivedDataEl.textContent = text;
    } catch (e) {
        console.error(e);
        receivedDataEl.textContent = `エラー: ${e.message}`;
    }
}

function handleCreate() {
    console.log("作成モードで起動します");
    const createLinkBtn = document.getElementById('createLinkBtn');
    const outputUrlEl = document.getElementById('outputUrl');

    createLinkBtn.onclick = async () => {
        const dataText = document.getElementById('data').value;
        if (!dataText) {
            alert("共有データを入力してください。");
            return;
        }
        const data = new TextEncoder().encode(dataText);
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const password = document.getElementById('password').value || undefined;
        const expiresInDaysVal = document.getElementById('expiresInDays').value;
        const expiresInDays = expiresInDaysVal ? parseInt(expiresInDaysVal, 10) : undefined;
        const payloadLimitVal = document.getElementById('payloadLimit').value;
        const simpleModePayloadLimit = payloadLimitVal ? parseInt(payloadLimitVal, 10) : undefined;
        
        try {
            outputUrlEl.textContent = "生成中...";
            const link = await createShareLink({
                data,
                mode,
                uploadHandler,
                shortenUrlHandler,
                password,
                expiresInDays,
                simpleModePayloadLimit,
            });
            outputUrlEl.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>`;
        } catch(e) {
            console.error(e);
            outputUrlEl.textContent = `エラー: ${e.message}`;
        }
    };
}

// 起動時の処理
// URLにフラグメントがあれば受信モード、なければ作成モード
if (window.location.hash) {
    handleReceive();
} else {
    handleCreate();
}
