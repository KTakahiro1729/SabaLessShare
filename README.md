# SabaLessShare

> サーバーレスかつブラウザ完結の簡易データ共有ライブラリ。フレームワークに依存せず、安全なクライアントサイドデータ共有を実現します。

## 📦 インストール

本パッケージはまだ npm に公開されていません。GitHub からインストールできます。

```bash
npm install git+https://github.com/<ユーザー名>/saba-less-share.git
# または
yarn add https://github.com/<ユーザー名>/saba-less-share.git
```

ローカルの開発版をリンクして試すには:

```bash
cd path/to/saba-less-share
npm link
# プロジェクト側で
npm link saba-less-share
```

## 🚀 使い方

```js
import { createShareLink, receiveSharedData } from 'saba-less-share';
```

### createShareLink(options)

データを暗号化し、アップロード・URL短縮を行った後、暗号化パラメータをフラグメントに含む共有リンクを返します。

#### オプション

* `data: ArrayBuffer` — 共有したいバイナリデータ
* `uploadHandler: (data: ArrayBuffer) => Promise<string>` — 暗号化したペイロードをアップロードし、ファイルのURLを返す関数
* `shortenUrlHandler: (url: string) => Promise<string>` — ペイロードURLを短縮し、短縮URLを返す関数
* `password?: string` — （任意）DEKを暗号化するパスワード
* `expiresIn?: number` — （任意）リンクの有効期限（ミリ秒単位）

#### 戻り値

* `Promise<string>` — 完成した共有URL（`#key=…&iv=…&salt=…&expdate=…` を含む）

#### サンプル

```js
const link = await createShareLink({
  data: yourArrayBuffer,
  uploadHandler: uploadToServer,
  shortenUrlHandler: shortenWithService,
  password: 'mySecret',
  expiresIn: 24 * 60 * 60 * 1000, // 1日
});
console.log(link);
```

### receiveSharedData(options)

現在の `window.location` からリンクを解析し、ペイロードをダウンロード・復号してデータを返します。必要であればパスワードをプロンプトします。

#### オプション

* `location: Location` — 通常は `window.location`
* `downloadHandler: (url: string) => Promise<ArrayBuffer>` — ペイロードをダウンロードして ArrayBuffer を返す関数
* `passwordPromptHandler: () => Promise<string|null>` — パスワードを入力させる関数。入力なければ `null`

#### 戻り値

* `Promise<ArrayBuffer>` — 復号されたデータ

#### サンプル

```js
const data = await receiveSharedData({
  location: window.location,
  downloadHandler: fetchArrayBuffer,
  passwordPromptHandler: promptPassword,
});
// 復号データを利用...
```

## 🛠️ モジュール構成

* **src/index.js**

  * `createShareLink`
  * `receiveSharedData`
* **src/crypto.js**

  * `arrayBufferToBase64` / `base64ToArrayBuffer`
  * `generateSalt`, `generateDek`, `generateKek`
  * `exportKeyToString`, `importKeyFromString`
  * `encryptData`, `decryptData`
* **src/errors.js**

  * `InvalidLinkError`
  * `ExpiredLinkError`
  * `PasswordRequiredError`
  * `DecryptionError`
* **src/url.js**

  * `parseShareUrl`

## ⚙️ 開発・テスト

Jest を使って単体テストを実行します。ブラウザAPI (Web Crypto など) をシミュレートするために `jest-environment-jsdom` を使用しています。

```bash
npm test
```

## 🤝 貢献

Issue や Pull Request は歓迎します！

## 📄 ライセンス

MITライセンス
