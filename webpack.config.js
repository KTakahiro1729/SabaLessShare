const path = require('path');

module.exports = (env) => {
  const isDevelopment = env.development;

  return {
    // 開発モードまたは本番モードを設定
    mode: isDevelopment ? 'development' : 'production',
    // ソースマップを有効にするかどうか (デバッグ用)
    devtool: isDevelopment ? 'eval-source-map' : 'source-map',
    // エントリーポイントの定義
    entry: {
      main: './src/index.js', // ライブラリのメインエントリーポイント
      'example-app': './examples/app.js' // デモアプリケーションのエントリーポイント
    },
    // 出力設定
    output: {
      path: path.resolve(__dirname, 'dist'), // 出力ディレクトリ
      filename: '[name].js', // 出力ファイル名 (main.js, example-app.js など)
      library: {
        name: 'SabaLessShare', // ライブラリ名
        type: 'umd', // Universal Module Definition (CommonJS, AMD, global で利用可能)
        export: 'default', // デフォルトエクスポートを公開する
      },
      // publicPath: '/dist/', // Webpack Dev Server でのリソースの参照パス
    },
    // モジュールの解決設定
    resolve: {
      extensions: ['.js'], // インポート時に解決する拡張子
    },
    // モジュールルール (Babel ローダーを使用して ES6+ コードを変換)
    module: {
      rules: [
        {
          test: /\.js$/, // .js ファイルに適用
          exclude: /node_modules/, // node_modules フォルダを除外
          use: {
            loader: 'babel-loader', // Babel ローダーを使用
            options: {
              presets: ['@babel/preset-env'], // ES6+ を変換するためのプリセット
            },
          },
        },
      ],
    },
    // Webpack Dev Server の設定 (デモアプリケーションの実行用)
    devServer: {
      static: {
        directory: path.join(__dirname, 'examples'), // 静的ファイルの提供元ディレクトリ
        publicPath: '/', // 静的ファイルが提供されるURLパス
      },
      port: 8080, // サーバーポート
      hot: true, // ホットモジュールリプレースメントを有効にする
      open: true, // サーバー起動時にブラウザを開く
    },
    // 'argon2-browser' の WASM ファイルを処理するための設定
    // 'asset/resource' は、ファイルを個別のファイルとして出力し、そのURLを提供します。
    // argon2-browser のビルド済み WASM ファイルは dist/wasm/argon2.wasm にあると想定
    experiments: {
      asyncWebAssembly: true,
    },
  };
};
