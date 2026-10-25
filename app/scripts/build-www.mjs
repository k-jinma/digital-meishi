// build-www.mjs — ルートのWeb版をアプリ用に www/ へ集める
//
// - 送り手画面と受け取りページ、CSS・JS・ライブラリをコピーする
// - 書体（Fontsource）の 400/700 の woff2 だけを同梱し、オフラインで使えるようにする
// - アプリ用の設定（受け取りページの公開URLなど）を js/config.js に書き出す
//
// 受け取りページの公開URLは環境変数 RECEIVER_BASE で変えられる。
//   RECEIVER_BASE=https://example.com/card.html npm run build:www
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(appDir, '..');
const out = join(appDir, 'www');
const RECEIVER_BASE = process.env.RECEIVER_BASE || 'https://digital-meishi-iota.vercel.app/card.html';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const path of ['index.html', 'card.html', 'manifest.webmanifest', 'LICENSE', 'css', 'js', 'vendor', 'icons']) {
  cpSync(join(webRoot, path), join(out, path), { recursive: true });
}

// ---- 書体 ----
// meishi.js の FONTS のキーと Fontsource のパッケージ名の対応
const FONT_PACKAGES = {
  gothic: 'noto-sans-jp',
  mincho: 'noto-serif-jp',
  maru: 'zen-maru-gothic',
  udg: 'biz-udpgothic',
  udm: 'biz-udpmincho',
};
const fontFiles = {};
let fontCount = 0;
for (const [key, pkg] of Object.entries(FONT_PACKAGES)) {
  const src = join(appDir, 'node_modules', '@fontsource', pkg);
  const dest = join(out, 'fonts', pkg);
  mkdirSync(join(dest, 'files'), { recursive: true });
  let css = '';
  for (const weight of ['400', '700']) {
    // woff の代替指定は外し、woff2 だけを使う（アプリの WebView はすべて woff2 に対応）
    const text = readFileSync(join(src, `${weight}.css`), 'utf8')
      .replace(/, url\([^)]*\.woff\) format\('woff'\)/g, '');
    for (const [, file] of text.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
      copyFileSync(join(src, 'files', file), join(dest, 'files', file));
      fontCount++;
    }
    css += text + '\n';
  }
  writeFileSync(join(dest, 'font.css'), css);
  copyFileSync(join(src, 'LICENSE'), join(dest, 'LICENSE'));
  fontFiles[key] = `fonts/${pkg}/font.css`;
}

// ---- アプリ用の設定 ----
writeFileSync(join(out, 'js', 'config.js'), `/* config.js — build-www.mjs が生成するアプリ用の設定 */
window.MEISHI_CONFIG = ${JSON.stringify({ receiverBase: RECEIVER_BASE, localFonts: fontFiles }, null, 2)};
`);

console.log(`www/ を作成しました（書体ファイル ${fontCount} 個、受け取りページ ${RECEIVER_BASE}）`);
