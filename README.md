# SabaLessShare

> サーバーレスかつブラウザ完結の簡易データ共有ライブラリ。フレームワークに依存せず、安全なクライアントサイドデータ共有を実現します。

Simpleモードがテストできる実装サンプルはdocsフォルダに実装されており、[Github Pages](https://ktakahiro1729.github.io/SabaLessShare/)から確認できます。

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
* `mode: 'simple' | 'cloud'` — 動作モード（デフォルト: `'simple'`）。`simple`では gzip 圧縮してから暗号化、`cloud`では生データを暗号化
* `uploadHandler: (data: { ciphertext: ArrayBuffer, iv: Uint8Array }) => Promise<string>` — 暗号化したデータをアップロードし、ファイルIDまたはURLを返す関数
* `shortenUrlHandler: (url: string) => Promise<string>` — `p` クエリを含むURLを短縮する関数
* `password?: string` — （任意）KEKを生成するためのパスワード。指定すると、DEKがパスワードベースで暗号化される
* `expiresInDays?: number` — （任意）リンクの有効期限（日数単位）。設定しない場合無期限。
* `simpleModePayloadLimit?: number` — （任意）Simpleモードで許可するペイロード長の上限。デフォルトは7700文字。

#### 戻り値

* `Promise<string>` — 完成した共有URL（`#k=…&i=…&s=…&x=…&m=…` を含む）

#### サンプル

```js
const link = await createShareLink({
  data: yourArrayBuffer,
  mode: 'simple',
  uploadHandler: uploadToServer,
  shortenUrlHandler: shortenWithService,
  password: 'mySecret',
  expiresInDays: 1, // 1日
});
console.log(link);
```


### receiveSharedData(options)

現在の `window.location` からリンクを解析し、ペイロードをダウンロード・復号してデータを返します。必要であればパスワードをプロンプトします。

#### オプション

* `location: Location` — 通常は `window.location`
* `downloadHandler: (id: string) => Promise<{ ciphertext: ArrayBuffer, iv: Uint8Array }>` — ファイルIDから暗号化データを取得する関数
* `passwordPromptHandler: () => Promise<string|null>` — パスワードを入力させる関数。入力がなければ `null`

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

## Dynamic Sharing API

3ファイル方式の動的共有を簡潔に利用するための高レベルAPIです。実際の保存処理は
`storageAdapter` が担います。

### storageAdapter インターフェース

- `create(data: any): Promise<string>` — データを保存してIDを返す
- `read(id: string): Promise<any>` — IDからデータを取得
- `update(id: string, data: any): Promise<void>` — 既存データを上書き

### createDynamicLink(options)

- `data: ArrayBuffer` — 保存するデータ
- `adapter: storageAdapter` — ストレージ操作を実装したオブジェクト
- `password?: string` — パスワード指定時、DEKを暗号化
- `expiresInDays?: number` — リンクの有効期限 (日数)

戻り値は `{ shareLink, pointerFileId, key, salt }`。

### receiveDynamicData(options)

- `location: Location` — 解析対象のURL
- `adapter: storageAdapter` — データ取得に使用
- `passwordPromptHandler: () => Promise<string|null>` — パスワード入力ハンドラ

### updateDynamicLink(options)

- `pointerFileId: string` — ポインタファイルID
- `newData: ArrayBuffer` — 新しいデータ
- `key: string` / `salt: string|null` — `createDynamicLink`の戻り値
- `password?: string` — パスワード保護時に指定
- `adapter: storageAdapter` — ストレージアダプター

## セキュリティ機能

### 暗号化

- **AES-GCM 128bit** でデータを暗号化
- データ暗号化キー（DEK）とキー暗号化キー（KEK）の2層構造
- パスワード指定時は **Argon2id** でパスワードベースキー導出（メモリ: 19456KB、時間: 2、並列度: 1）
- 各暗号化操作で独立した初期化ベクトル（IV）を生成

### 認証付き暗号化（AEAD）

- 有効期限が設定されている場合、Additional Authenticated Data（AAD）として使用
- データの完全性と真正性を保証
- データ本体とファイルIDの両方が同じAADで保護される

### セキュリティ設計

- **二重暗号化**: データ本体とファイルIDを別々に暗号化
- **プライバシー保護**: 受信後、ブラウザ履歴からURLパラメータを自動削除
- **ゼロ知識**: サーバー側でデータ内容を知ることができない設計

### リンクの構造

生成されるリンクは以下の形式になります：

```
https://example.com/demo/?p=<base64-encoded-encrypted-file-id>#k=<key>&i=<iv>&m=<mode>&s=<salt>&x=<expdate>
```

- `p`（クエリパラメータ）: 暗号化されたファイルID
- `k`（フラグメント）: DEK（パスワード有りの場合は暗号化されたDEK）
- `i`（フラグメント）: ファイルID暗号化用のIV
- `m`（フラグメント）: 動作モード（`s` / `c` / `d`）
- `s`（フラグメント）: パスワード指定時のsalt（任意）
- `x`（フラグメント）: 有効期限 (`YYYY-MM-DD`)（任意）

## モジュール構成

* **src/index.js**
  * `createShareLink` - データ共有リンクの生成
  * `receiveSharedData` - 共有データの受信・復号
* **src/dynamic.js**
  * `createDynamicLink` / `receiveDynamicData` / `updateDynamicLink` - 動的共有API
* **src/crypto.js**
  * `arrayBufferToBase64` / `base64ToArrayBuffer` - Base64エンコーディング
  * `generateSalt`, `generateDek`, `generateKek` - 暗号鍵生成
  * `exportKeyToString`, `importKeyFromString` - 鍵の文字列変換
  * `encryptData`, `decryptData` - AES-GCMデータ暗号化/復号
* **src/errors.js**
  * `InvalidLinkError` - 不正なリンク形式
  * `ExpiredLinkError` - 期限切れリンク
  * `PasswordRequiredError` - パスワード要求
  * `DecryptionError` - 復号エラー
* **src/url.js**
  * `parseShareUrl` - URLパラメータ解析

## 動作モード

### Simple Mode（デフォルト）

- データを gzip 圧縮してから暗号化
- 小さなテキストデータに適している
- `uploadHandler` の戻り値をファイルIDとして扱う

Simple Modeでは暗号化済みIDをBase64化した`p`クエリに直接埋め込みます。
この`p`値はURLエンコード前でおよそ**7700文字**までに制限されています。
それ以上のデータを扱う場合はCloud Modeの利用を検討してください。
以下は圧縮前のデータサイズと上限の関係を示したおおよその目安です（実際の圧縮率はデータ内容によって大きく変動します）。

| データ形式の例 | 圧縮前のデータサイズ目安 | 備考 |
| --- | --- | --- |
| 一般的な日本語のブログ記事や報告書 | 約10KB〜12KB（全角5,000〜6,000文字相当） | テキストは圧縮率が高いため、比較的多めの量を扱えます。 |
| 構造化された設定ファイルやAPIレスポンス | 約8KB〜10KB | キー名の繰り返しが多いほど圧縮が効きやすくなります。 |
| JavaScriptやPythonなどのプログラムコード | 約7KB〜9KB | インデントや繰り返しパターンが圧縮率に影響します。 |
| PNG画像、PDFファイルなど | 非推奨（数KBでも超過の可能性あり） | これらの形式はgzip圧縮がほとんど効かない、あるいは逆に増える場合があるため、Cloud Modeを使用してください。 |

### Cloud Mode 

- データを圧縮せずに暗号化
- バイナリファイルや画像などに適している
- `uploadHandler` の戻り値をファイルIDとして扱う

## 処理フロー

### 共有リンク生成時

1. DEK（データ暗号化キー）を生成
2. データを暗号化（Simple Modeの場合はgzip圧縮後）
3. 暗号化データを`uploadHandler`でアップロード
4. ファイルIDを暗号化してクエリパラメータに格納
5. DEKと暗号化パラメータをフラグメントに格納
6. 完成したURLを`shortenUrlHandler`で短縮

### データ受信時

1. URLからパラメータを解析
2. 有効期限チェック
3. パスワードが必要な場合は入力を求める
4. ファイルIDを復号
5. `downloadHandler`で暗号化データを取得
6. データを復号（Simple Modeの場合は展開）
7. **重要**: ブラウザ履歴からURLパラメータを削除

## 重要な制約事項

### ブラウザ要件

- **Web Crypto API** 対応ブラウザが必要（現代的なブラウザであれば対応）
- **HTTPS環境** が必要（Web Crypto APIの制約）
- **WebAssembly** 対応が必要（Argon2実装のため）

### サイズ制限

- ブラウザのメモリ制限により、大容量ファイルの処理には注意が必要
- Simple Modeでは追加でgzip圧縮のメモリが必要

### パフォーマンス

- Argon2によるパスワード導出は意図的に時間がかかる設計（セキュリティのため）
- 大きなファイルの暗号化/復号化は時間がかかる場合があります

## ⚙️ 開発・テスト

Jest を使って単体テストを実行します。ブラウザAPI (Web Crypto など) をシミュレートするために `jest-environment-jsdom` を使用しています。

```bash
npm test
```

デモページをビルドするには：

```bash
npm run build
```

## トラブルシューティング

### よくあるエラー

- **`InvalidLinkError`**: URLが不正な形式の場合
- **`ExpiredLinkError`**: リンクの有効期限が切れている場合
- **`PasswordRequiredError`**: パスワードが必要だが提供されていない場合
- **`DecryptionError`**: 復号に失敗した場合（パスワード間違いやデータ破損）

### デバッグのヒント

- ブラウザの開発者ツールでコンソールエラーを確認
- HTTPS環境で実行されているか確認
- Web Crypto APIが利用可能か確認: `console.log(!!window.crypto?.subtle)`

## 🔧 依存関係

- **argon2-browser** (^1.18.0) - パスワードベースキー導出
- **pako** (^2.1.0) - gzip圧縮/展開

## 🤝 貢献

Issue や Pull Request は歓迎します！

## 📄 ライセンス

MITライセンス
