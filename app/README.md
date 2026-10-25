# デジタル名刺アプリ（送り手用・Capacitor）

ルートのWeb版を [Capacitor](https://capacitorjs.com/) で iOS / Android アプリにしたものです。
受け取る人は今までどおりアプリ不要で、QRコードを読み取って受け取りページで保存します。

## Web版との違い

| | Web版 | アプリ版 |
|---|---|---|
| 送り手の画面 | Vercel などから読み込む | 端末内で完結（ネット接続不要） |
| 書体 | Google Fonts から読み込む | アプリに同梱（外部への接続なし） |
| 名刺を見せる画面の向き | iPhone は固定できないため CSS で回転 | 横向きに固定（通常の画面は縦向き固定） |
| 名刺を見せている間 | スリープ防止のみ | 画面を最大の明るさにし、スリープ防止。閉じると元に戻す |
| ファイルを渡す | ブラウザの共有／ダウンロード | 端末の共有シート（写真へ保存・AirDrop など） |

受け取りページ（`card.html`）はアプリに入れられないため、Web上に公開しておく必要があります。
受け取りページが端末に届けるのは画面の部品だけで、名刺の情報はQRコードに入っておりサーバーには送られません。
相手がオフラインのときは、名刺を見せる画面の「相手がオフラインのとき」で、連絡先データを直接入れたQRに切り替えられます（カメラで読み取ると連絡先に追加できる。ネット接続不要）。

## 構成

```
app/
  package.json            Capacitor とプラグイン、書体（Fontsource）
  capacitor.config.json   アプリID・アプリ名
  scripts/build-www.mjs   ルートのWeb版と書体を www/ に集め、js/config.js を生成する
  assets/                 アイコン・スプラッシュ画面の元画像（@capacitor/assets で各サイズを生成）
  android/  ios/          ネイティブプロジェクト
  www/                    生成物（Git管理外）
```

使っているプラグイン：`@capacitor/screen-orientation`、`@capacitor/share`、`@capacitor/filesystem`、
`@capacitor-community/keep-awake`、`@capacitor-community/screen-brightness`

## ビルド手順

必要なもの：Node.js 22 以上。iOS は Mac と Xcode、Android は Android Studio。

```sh
cd app
npm install
npm run sync          # www/ を作り直してネイティブプロジェクトへ反映

npm run open:ios      # Xcode で開く → 署名チームを設定して実機で実行
npm run open:android  # Android Studio で開く → 実機で実行
```

Web版（ルートのファイル）を変更したら、`npm run sync` を実行してからビルドしてください。

受け取りページの公開URLを変えるときは、環境変数で指定します。

```sh
RECEIVER_BASE=https://example.com/card.html npm run sync
```

アイコンを作り直すときは、`assets/` の画像を差し替えてから次を実行します。

```sh
npx capacitor-assets generate --iconBackgroundColor '#1f3a5f' --iconBackgroundColorDark '#1f3a5f' \
  --splashBackgroundColor '#1f3a5f' --splashBackgroundColorDark '#1f3a5f'
```

## 実機で確認すること

- 名刺を見せる画面で横向きに固定され、閉じると縦向きに戻るか
- 見せている間に画面が最大の明るさになり、閉じると元の明るさに戻るか
- 「ファイルを直接送信」で共有シートが開き、写真への保存や AirDrop・クイック共有ができるか
- 「相手がオフラインのとき」の連絡先QRを、別のスマホのカメラで読み取って連絡先に追加できるか

## 配布について

- App Store：Apple Developer Program（年額）への登録が必要です。
- Google Play：デベロッパー登録（初回のみ）が必要です。
- アプリID は `io.github.kjinma.digitalmeishi` です。ストアに登録した後は変更できないので、別のIDにする場合は登録前に `capacitor.config.json` とネイティブプロジェクトを変更してください。

## ライセンス

書体は SIL Open Font License 1.1 です（各書体のライセンスは `www/fonts/*/LICENSE` に同梱されます）。
