import {
  base64urlEncode,
  base64urlDecode,
  generateAESGCMKey,
  exportAESGCMKeyRaw,
  importAESGCMKeyRaw,
  encryptAESGCM,
  decryptAESGCM,
  generateSalt,
  deriveKeyFromPassword,
} from './lib/cryptoUtils';

// TinyURL APIのエンドポイント
const TINYURL_API_ENDPOINT = 'https://tinyurl.com/api-create.php';

/**
 * サーバーレスでセキュアなデータ共有機能を提供するライブラリ。
 * 全ての暗号化/復号はクライアントサイドで行われます。
 */
class SabaLessShare {
  /**
   * 新しいSabaLessShareインスタンスを作成します。
   * @param {string} viewPageBaseUrl - 共有リンクの閲覧ページを指すベースURL。
   * 例: 'http://localhost:8080/examples/index.html'
   */
  constructor(viewPageBaseUrl) {
    if (!viewPageBaseUrl) {
      throw new Error('viewPageBaseUrlは必須です。共有リンクのベースURLを指定してください。');
    }
    this.viewPageBaseUrl = viewPageBaseUrl;
  }

  /**
   * 指定されたペイロードからセキュアな共有リンクを生成します。
   * @param {string} payload - 共有対象のデータ文字列 (簡易データまたはファイルID)
   * @param {{ isPasswordProtected: boolean, password?: string }} options - 共有オプション
   * @returns {Promise<string>} 短縮されたアクセスURLとデコードキーを連結した文字列
   * フォーマット: `[短縮されたaccessURL]#[decodeKey]`
   */
  async createShareableLink(payload, options) {
    const { isPasswordProtected, password } = options;

    if (isPasswordProtected && !password) {
      throw new Error('パスワード保護が有効な場合、パスワードは必須です。');
    }

    // 1. DEK (データ暗号化キー) の生成
    // このキーは、ペイロードを暗号化するための「宝箱の鍵」です。
    const dek = await generateAESGCMKey();
    const rawDekBuffer = await exportAESGCMKeyRaw(dek); // raw形式でエクスポート

    let decodeKey; // 最終的にURLハッシュに含めるキー
    let encryptedDekInfo = {}; // パスワード保護時にDEKを暗号化する情報

    if (isPasswordProtected) {
      // パスワード保護が有効な場合
      // decodeKeyはユーザーが設定したパスワードそのものです。
      decodeKey = password;

      // Saltの生成
      const saltBuffer = generateSalt();
      const saltBase64Url = base64urlEncode(saltBuffer);

      // KEK (キー暗号化キー) の導出: パスワードとSaltからKEKを導出 (金庫の錠前)
      const kek = await deriveKeyFromPassword(password, saltBuffer);

      // DEKの暗号化: 導出したKEKを使ってDEKを暗号化します。
      const { iv: encryptedDekIv, ciphertext: encryptedDekCiphertext } = await encryptAESGCM(
        kek,
        base64urlEncode(rawDekBuffer) // raw DEKをBase64URLにしてから暗号化
      );

      encryptedDekInfo = {
        key: `${encryptedDekIv}.${encryptedDekCiphertext}`, // IVと暗号文を結合
        salt: saltBase64Url,
      };
    } else {
      // パスワード保護が不要な場合
      // decodeKeyは、raw形式のDEKをBase64URL形式でエンコードした文字列です。
      decodeKey = base64urlEncode(rawDekBuffer);
    }

    // 4. ペイロードの暗号化
    // 元のDEK (生成した宝箱の鍵) を使ってペイロードを暗号化します。
    const { iv: payloadIv, ciphertext: payloadCiphertext } = await encryptAESGCM(dek, payload);
    const encryptedPayload = `${payloadIv}.${payloadCiphertext}`;

    // 5. 「長いURL」の構築
    const urlParams = new URLSearchParams();
    urlParams.append('p', encryptedPayload); // 'p' はペイロードの略

    if (isPasswordProtected) {
      urlParams.append('k', encryptedDekInfo.key); // 'k' は暗号化されたDEK
      urlParams.append('s', encryptedDekInfo.salt); // 's' はソルト
    }

    const longUrl = `${this.viewPageBaseUrl}?${urlParams.toString()}`;

    // 6. URLの短縮 (TinyURL APIを使用)
    let accessUrl;
    try {
      const response = await fetch(TINYURL_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `url=${encodeURIComponent(longUrl)}`,
      });

      if (!response.ok) {
        throw new Error(`TinyURL APIからエラー: ${response.statusText}`);
      }
      accessUrl = await response.text();
    } catch (error) {
      console.error('TinyURLの短縮中にエラーが発生しました:', error);
      // エラーが発生した場合は、元の長いURLを使用するフォールバック
      accessUrl = longUrl;
      console.warn('TinyURLサービスが利用できないため、元の長いURLを使用します。');
    }

    // 7. 最終的な共有文字列を返す
    // 短縮されたURLとデコードキーをハッシュで連結します。
    return `${accessUrl}#${decodeKey}`;
  }

  /**
   * 共有リンクを解析し、ペイロードを復号して返します。
   * ページの読み込み時に実行されることを想定しています。
   * @returns {Promise<string>} 復号されたペイロード
   * @throws {Error} 無効なリンク、不正なパスワード、データの破損/改ざんなど
   */
  async processSharedLinkOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.substring(1); // 先頭の'#'を除去

    const encryptedPayloadCombined = urlParams.get('p');
    const encryptedDekCombined = urlParams.get('k'); // パスワード保護時の暗号化されたDEK
    const saltBase64Url = urlParams.get('s'); // パスワード保護時のソルト

    if (!encryptedPayloadCombined || !hash) {
      throw new Error('無効な共有リンクです。必要な情報が不足しています。');
    }

    // encryptedPayloadCombined を IV と暗号文に分割
    const [payloadIvBase64Url, payloadCiphertextBase64Url] = encryptedPayloadCombined.split('.');
    if (!payloadIvBase64Url || !payloadCiphertextBase64Url) {
      throw new Error('ペイロードデータが不正です。');
    }

    let dek; // データ暗号化キー

    if (encryptedDekCombined && saltBase64Url) {
      // パスワード保護モードの場合
      const userPassword = hash; // ハッシュ部分がユーザーが設定したパスワード
      if (!userPassword) {
        throw new Error('パスワード保護されたリンクですが、パスワードがURLに含まれていません。');
      }

      // encryptedDekCombined を IV と暗号文に分割
      const [encryptedDekIvBase64Url, encryptedDekCiphertextBase64Url] = encryptedDekCombined.split('.');
      if (!encryptedDekIvBase64Url || !encryptedDekCiphertextBase64Url) {
        throw new Error('DEK暗号化データが不正です。');
      }

      const saltBuffer = base64urlDecode(saltBase64Url);

      try {
        // パスワードとソルトからKEKを再導出
        const kek = await deriveKeyFromPassword(userPassword, saltBuffer);

        // KEKを使って暗号化されたDEKを復号
        const rawDekBase64Url = await decryptAESGCM(
          kek,
          encryptedDekIvBase64Url,
          encryptedDekCiphertextBase64Url
        );

        // 復号されたraw DEKをCryptoKeyとしてインポート
        dek = await importAESGCMKeyRaw(base64urlDecode(rawDekBase64Url));
      } catch (error) {
        console.error('DEKの復号に失敗しました:', error);
        throw new Error('パスワードが正しくありません。またはリンクが破損しています。');
      }
    } else {
      // パスワードなしモードの場合
      // ハッシュ部分がBase64URLエンコードされたDEKそのものです。
      const rawDekBase64Url = hash;
      try {
        dek = await importAESGCMKeyRaw(base64urlDecode(rawDekBase64Url));
      } catch (error) {
        console.error('DEKのインポートに失敗しました:', error);
        throw new Error('無効なDEKです。リンクが破損している可能性があります。');
      }
    }

    // ペイロードの復号
    let decryptedPayload;
    try {
      decryptedPayload = await decryptAESGCM(
        dek,
        payloadIvBase64Url,
        payloadCiphertextBase64Url
      );
    } catch (error) {
      console.error('ペイロードの復号に失敗しました:', error);
      throw new Error('ペイロードの復号に失敗しました。データが破損または改ざんされている可能性があります。');
    }

    // URLから機密情報を消去
    // これにより、ブラウザの履歴や共有されるURLに機密情報が残らないようにします。
    window.history.replaceState(null, '', window.location.pathname);

    return decryptedPayload;
  }
}

export default SabaLessShare;
