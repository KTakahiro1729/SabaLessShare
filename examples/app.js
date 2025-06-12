import SabaLessShare from '../src/index.js'; // SabaLessShare ライブラリをインポート

// DOM要素の取得
const payloadInput = document.getElementById('payloadInput');
const passwordProtectCheckbox = document.getElementById('passwordProtectCheckbox');
const passwordSection = document.getElementById('passwordSection');
const passwordInput = document.getElementById('passwordInput');
const createLinkBtn = document.getElementById('createLinkBtn');
const generatedLinkSection = document.getElementById('generatedLinkSection');
const generatedLinkOutput = document.getElementById('generatedLinkOutput');
const copyLinkBtn = document.getElementById('copyLinkBtn');

const decryptedDataSection = document.getElementById('decryptedDataSection');
const decryptedDataOutput = document.getElementById('decryptedDataOutput');
const noDataMessage = document.getElementById('noDataMessage');

const messageBox = document.getElementById('message-box');
const errorBox = document.getElementById('error-box');

// メッセージ表示ヘルパー
function showMessage(element, message, duration = 3000) {
  element.textContent = message;
  element.classList.remove('hidden');
  setTimeout(() => {
    element.classList.add('hidden');
    element.textContent = '';
  }, duration);
}

function showError(message, duration = 5000) {
  showMessage(errorBox, message, duration);
}

// SabaLessShare インスタンスの初期化
// ここではデモページ自身をビューページベースURLとして指定します。
const sabaLessShare = new SabaLessShare(window.location.origin + window.location.pathname);

// パスワード保護チェックボックスのイベントリスナー
passwordProtectCheckbox.addEventListener('change', () => {
  if (passwordProtectCheckbox.checked) {
    passwordSection.classList.remove('hidden');
  } else {
    passwordSection.classList.add('hidden');
    passwordInput.value = ''; // チェックを外したらパスワード入力をクリア
  }
});

// 共有リンク生成ボタンのイベントリスナー
createLinkBtn.addEventListener('click', async () => {
  const payload = payloadInput.value;
  const isPasswordProtected = passwordProtectCheckbox.checked;
  const password = passwordInput.value;

  if (!payload) {
    showError('共有するデータを入力してください。');
    return;
  }

  if (isPasswordProtected && !password) {
    showError('パスワードで保護する場合、パスワードは必須です。');
    return;
  }

  try {
    createLinkBtn.textContent = '生成中...';
    createLinkBtn.disabled = true;

    // 共有リンクの生成
    const shareableLink = await sabaLessShare.createShareableLink(payload, {
      isPasswordProtected,
      password,
    });

    generatedLinkOutput.value = shareableLink;
    generatedLinkSection.classList.remove('hidden');
    showMessage(messageBox, '共有リンクが生成されました！');

  } catch (error) {
    console.error('共有リンクの生成中にエラー:', error);
    showError(`リンク生成に失敗しました: ${error.message}`);
    generatedLinkSection.classList.add('hidden'); // エラー時はリンクセクションを非表示に
  } finally {
    createLinkBtn.textContent = '共有リンクを生成';
    createLinkBtn.disabled = false;
  }
});

// リンクコピーボタンのイベントリスナー
copyLinkBtn.addEventListener('click', () => {
  generatedLinkOutput.select();
  generatedLinkOutput.setSelectionRange(0, 99999); // モバイルデバイス用

  // `document.execCommand('copy')` は非推奨ですが、iFrame内で `navigator.clipboard.writeText` が動作しない場合があるため使用
  try {
    const success = document.execCommand('copy');
    if (success) {
      showMessage(messageBox, 'リンクをコピーしました！');
    } else {
      showError('リンクのコピーに失敗しました。手動でコピーしてください。');
    }
  } catch (err) {
    console.error('コピー失敗:', err);
    showError('リンクのコピーに失敗しました。手動でコピーしてください。');
  }
});

// ページの読み込み時に共有リンクの閲覧プロセスを実行
window.addEventListener('load', async () => {
  // URLに 'p' (ペイロード) パラメータがあるか確認
  const urlParams = new URLSearchParams(window.location.search);
  const hasPayloadParam = urlParams.has('p');

  if (hasPayloadParam) {
    try {
      // 共有リンクを処理し、データを復号
      const decryptedData = await sabaLessShare.processSharedLinkOnLoad();
      decryptedDataOutput.value = decryptedData;
      decryptedDataSection.classList.remove('hidden');
      noDataMessage.classList.add('hidden');
      showMessage(messageBox, '共有データが正常に復号されました！');
    } catch (error) {
      console.error('共有リンクの処理中にエラー:', error);
      showError(`共有データの読み込みに失敗しました: ${error.message}`);
      decryptedDataSection.classList.add('hidden');
      noDataMessage.classList.remove('hidden');
      noDataMessage.textContent = `エラー: ${error.message}`; // エラーメッセージを表示
    }
  } else {
    // 共有データがない場合は、メッセージを表示
    decryptedDataSection.classList.add('hidden');
    noDataMessage.classList.remove('hidden');
    noDataMessage.textContent = '共有されたデータがありません。';
  }
});
