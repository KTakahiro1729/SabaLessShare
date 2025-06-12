# SabaLessShare (サバレス・シェア)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**サーバー不要！ブラウザだけで完結する、セキュアなデータ共有ライブラリ**

`SabaLessShare`は、専用のバックエンドサーバーを構築することなく、テキストデータやファイルIDなどを安全に共有するためのリンクを生成できる、クライアントサイド完結型のJavaScriptライブラリです。

データはユーザーのブラウザ内でエンドツーエンドで暗号化され、開発者や中間サーバーですらその内容を読み取ることはできません。

## 主な特徴

* **サーバーレス**: 追加のサーバーコストや運用保守は一切不要です。静的なWebサイトでホスティングできます。
* **エンドツーエンド暗号化**: データはユーザーのブラウザ内で暗号化・復号されます。プライバシーが最大限に保護されます。
* **強力なセキュリティ**: 最新のWeb標準である **Web Crypto API** を利用し、暗号化に `AES-256-GCM`、パスワードからの鍵導出に `Argon2id` を採用しています。
* **プライバシー保護設計**: URLの `#` (フラグメント) を利用して復号キーを扱うため、サーバーのアクセスログにキーが残る心配がありません。
* **柔軟なオプション**: パスワードによる追加の保護レイヤーを任意で設定できます。
* **導入が容易**: `npm` または `yarn` で簡単にインストールでき、数行のコードですぐに利用を開始できます。

## 使い方 (Usage)

### インストール

```bash
# npm
npm install sabaless-share

# yarn
yarn add sabaless-share
````

### 1\. 共有リンクを生成する

データを共有したい側のアプリケーションで、以下のコードを実行します。

```javascript
import { SabaLessSharer } from 'sabaless-share';

const sharer = new SabaLessSharer();

// 共有したいデータ
const myData = JSON.stringify({
  id: 'user-123',
  name: 'Taro Yamada',
  level: 99
});

// --- パスワードなしで共有する場合 ---
async function createSimpleLink() {
  try {
    const shareLink = await sharer.createShareableLink(myData, {
      isPasswordProtected: false,
    });
    console.log('共有リンク:', shareLink);
    // 生成されたリンク: "[https://tinyurl.com/xxxxxx#AbCdEfGhIjKlMnOp](https://tinyurl.com/xxxxxx#AbCdEfGhIjKlMnOp)..."
    // このリンクをユーザーにコピーさせる
  } catch (error) {
    console.error('リンクの生成に失敗しました:', error);
  }
}

// --- パスワードありで共有する場合 ---
async function createSecureLink(password) {
  try {
    const shareLink = await sharer.createShareableLink(myData, {
      isPasswordProtected: true,
      password: password,
    });
    console.log('保護された共有リンク:', shareLink);
    // 生成されたリンク: "[https://tinyurl.com/yyyyyy#your-password-here](https://tinyurl.com/yyyyyy#your-password-here)"
    // このリンクをユーザーにコピーさせる
  } catch (error) {
    console.error('リンクの生成に失敗しました:', error);
  }
}

createSimpleLink();
// or
// createSecureLink('super-secret-password-123');
```

### 2\. 共有リンクからデータを復元する

共有リンクを受け取った側のアプリケーション（例: `https://example.com/view`）で、以下のコードを実行します。

```javascript
import { SabaLessSharer } from 'sabaless-share';

const sharer = new SabaLessSharer();

// ページの読み込み時に実行
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // URLを解析し、データを復号
    const restoredData = await sharer.processSharedLinkOnLoad();

    if (restoredData.status === 'requires_password') {
      // パスワードが設定されている場合
      const password = prompt('パスワードを入力してください:');
      const finalData = await restoredData.decryptWithPassword(password);
      
      console.log('復元されたデータ:', JSON.parse(finalData));
      alert('データを復元しました！');

    } else if (restoredData.status === 'success') {
      // パスワードなしで成功した場合
      console.log('復元されたデータ:', JSON.parse(restoredData.data));
      alert('データを復元しました！');
    }

  } catch (error) {
    // パスワード間違い、リンクの破損など
    console.error('データの復元に失敗しました:', error);
    alert(`エラー: ${error.message}`);
  }
});
```

## 仕組み

`SabaLessShare`は、「エンベロープ暗号化」とURLフラグメントを組み合わせることで、サーバーレス環境でのセキュアな共有を実現しています。

1.  **データ暗号化キー(DEK)の生成**: 共有するデータ（=宝物）を暗号化するための使い捨ての強力な鍵（=宝箱の鍵）を生成します。
2.  **ペイロードの暗号化**: 「宝物」をDEKで暗号化します（=宝箱に鍵をかける）。
3.  **パスワード保護 (任意)**:
      * ユーザーが設定したパスワードとランダムなSaltから、キー暗号化キー(KEK)を生成します（=金庫のダイヤル番号）。
      * DEK（宝箱の鍵）を、さらにKEKで暗号化します（=宝箱の鍵を金庫に入れる）。
4.  **URLの構築**:
      * 暗号化されたペイロード（宝箱）や、暗号化されたDEK（金庫）を含む長いURLを生成します。
      * このURLをTinyURLなどのサービスで短縮します。
5.  **URLとキーの分離**:
      * **パスワードなしの場合**: `[短縮URL]#[DEK]`
      * **パスワードありの場合**: `[短縮URL]#[ユーザーパスワード]`
      * `#`以降のフラグメント部分はサーバーに送信されないため、アクセスログなどに復号キーが残ることはありません。

これにより、URLを知っているだけではデータを復号できず、別途伝えられた復号キー（DEKまたはパスワード）を持つ受信者だけが、自身のブラウザ内でデータを復元できる仕組みになっています。

## 貢献 (Contributing)

バグ報告、機能追加の提案、プルリクエストなどを歓迎します！
IssueやPull Requestを作成する前に、まずは既存のものを確認してください。

## ライセンス (License)

このプロジェクトは [MIT License](https://www.google.com/search?q=LICENSE) の下で公開されています。