/*
 * meishi.js — 送り手・受け手の両ページで共有する名刺ロジック
 *   - 名刺データ <-> URLフラグメントの相互変換（サーバーにデータを送らない）
 *   - Canvas への名刺描画（PNG の元画像）
 *   - PNG / PDF / vCard の生成
 *   - 共有（Web Share API）とダウンロードのフォールバック
 */
(function (global) {
  'use strict';

  // ---- 項目定義 -----------------------------------------------------------
  // key はURLに載せる短縮キー。required の項目は常に掲載する。
  // labelKey を持つ項目は「代表」「研究室」などの名前を送り手が付けられる。
  const FIELDS = [
    { key: 'og', label: '会社・組織名' },
    { key: 'dp', label: '部署（学部・学科など）' },
    { key: 'tt', label: '役職' },
    { key: 'ln', label: '姓',         required: true },
    { key: 'fn', label: '名' },
    { key: 'lk', label: 'セイ（フリガナ）' },
    { key: 'fk', label: 'メイ（フリガナ）' },
    { key: 't1', label: '電話1',      labelKey: 't1l', defaultLabel: '代表' },
    { key: 't2', label: '電話2',      labelKey: 't2l', defaultLabel: '直通' },
    { key: 'em', label: 'メール',     type: 'email' },
    { key: 'ur', label: 'URL',        type: 'url' },
  ];
  const DATA_KEYS = FIELDS.flatMap((f) => (f.labelKey ? [f.key, f.labelKey] : [f.key]));

  // 送り手が選べる左ラインの色。文字色は全色共通にして、名刺の読みやすさを揃える
  const THEMES = {
    navy:  { label: '紺',     line: '#1f3a5f' },
    green: { label: '緑',     line: '#1e6b52' },
    red:   { label: 'えんじ', line: '#9b2c2c' },
    rose:  { label: 'ローズ', line: '#c25b7a' },
    fuji:  { label: '藤',     line: '#6b5b95' },
  };
  const INK = { sub: '#5b6b7f', label: '#1f3a5f' };

  // 送り手が選べる書体。どれも Google Fonts にあり、端末に無くても同じ見た目で描ける
  const FONTS = {
    gothic: { label: 'ゴシック',   family: 'Noto Sans JP',    fallback: 'sans-serif' },
    mincho: { label: '明朝',       family: 'Noto Serif JP',   fallback: 'serif' },
    maru:   { label: '丸ゴシック', family: 'Zen Maru Gothic', fallback: 'sans-serif' },
    udg:    { label: 'UDゴシック', family: 'BIZ UDPGothic',   fallback: 'sans-serif' },
    udm:    { label: 'UD明朝',     family: 'BIZ UDPMincho',   fallback: 'serif' },
  };

  // ---- エンコード / デコード ---------------------------------------------
  function toBase64Url(bytes) {
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  // 掲載する項目だけを残した名刺データをフラグメント文字列にする
  function encodeCard(card) {
    const data = { v: 1, th: card.th || 'navy', ft: card.ft || 'gothic' };
    DATA_KEYS.forEach((k) => { if (card[k]) data[k] = card[k]; });
    return toBase64Url(new TextEncoder().encode(JSON.stringify(data)));
  }

  function decodeCard(fragment) {
    const json = new TextDecoder().decode(fromBase64Url(fragment.replace(/^#/, '')));
    const data = JSON.parse(json);
    if (data.v !== 1) throw new Error('未対応の名刺データ形式です');
    const card = { th: THEMES[data.th] ? data.th : 'navy', ft: FONTS[data.ft] ? data.ft : 'gothic' };
    DATA_KEYS.forEach((k) => { if (typeof data[k] === 'string') card[k] = data[k].slice(0, 200); });
    if (!card.ln) throw new Error('氏名がありません');
    return card;
  }

  function fullName(card) {
    return [card.ln, card.fn].filter(Boolean).join(' ');
  }

  function fullKana(card) {
    return [card.lk, card.fk].filter(Boolean).join(' ');
  }

  // ---- QR -----------------------------------------------------------------
  // QRのモジュールを ctx の (x, y) から size 四方に描く
  function drawQr(ctx, text, x, y, size) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const cell = size / n;
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(Math.floor(x + c * cell), Math.floor(y + r * cell),
                       Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
  }

  function renderQrCanvas(canvas, text) {
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    const margin = size * 0.06;
    drawQr(ctx, text, margin, margin, size - margin * 2);
  }

  // ---- 名刺描画 -----------------------------------------------------------
  // 91mm x 55mm（日本の標準名刺）を 12px/mm（約305dpi）で描く
  const MM = 12;
  const CARD_W = 91 * MM;
  const CARD_H = 55 * MM;
  let FONT = fontStack('gothic'); // drawCard のたびに名刺の書体へ切り替える

  function fontStack(key) {
    const f = FONTS[key] || FONTS.gothic;
    return `"${f.family}", ${f.fallback}`;
  }

  // Google Fonts の CSS を一度だけ読み込み、指定書体の太字・標準を使える状態にする。
  // text には描く文字を渡す（日本語フォントは文字範囲ごとに分割配信されるため）
  const requestedFonts = new Set();
  async function loadFonts(keys, text) {
    const need = keys.filter((k) => FONTS[k] && !requestedFonts.has(k));
    if (need.length) {
      need.forEach((k) => requestedFonts.add(k));
      const families = need.map((k) => 'family=' + FONTS[k].family.replace(/ /g, '+') + ':wght@400;700').join('&');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      document.head.appendChild(link);
      await new Promise((resolve) => { link.onload = link.onerror = resolve; });
    }
    try {
      await Promise.all(keys.flatMap((k) => FONTS[k]
        ? [`400 20px "${FONTS[k].family}"`, `700 20px "${FONTS[k].family}"`].map((f) => document.fonts.load(f, text))
        : []));
    } catch (e) {
      // 読み込めなければ端末の書体で描く
    }
  }

  function cardText(card) {
    return Object.values(card).join('') + 'TelE-mailWeb';
  }

  function fitText(ctx, text, maxWidth, size, weight) {
    let s = size;
    do {
      ctx.font = `${weight} ${s}px ${FONT}`;
      if (ctx.measureText(text).width <= maxWidth) break;
      s -= 2;
    } while (s > 12);
    return s;
  }

  /**
   * 名刺を描画し、PDFのリンク注釈に使うクリック領域を返す。
   * @param {HTMLCanvasElement} canvas
   * @param {object} card     名刺データ
   * @param {object} options  { qrUrl: 名刺に印字するQRのURL, photo: HTMLImageElement }
   * @returns {Array<{uri, x, y, w, h}>} px単位のリンク領域
   */
  function drawCard(canvas, card, options = {}) {
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    const theme = THEMES[card.th] || THEMES.navy;
    FONT = fontStack(card.ft);
    const links = [];
    const pad = 6 * MM;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = theme.line;
    ctx.fillRect(0, 0, 2 * MM, CARD_H);
    ctx.textBaseline = 'alphabetic';

    // 右上：顔写真またはロゴ
    const photoSize = 18 * MM;
    let rightEdge = CARD_W - pad;
    if (options.photo) {
      const px = CARD_W - pad - photoSize;
      const py = pad;
      const img = options.photo;
      const scale = Math.max(photoSize / img.width, photoSize / img.height);
      const sw = photoSize / scale;
      const sh = photoSize / scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, photoSize, photoSize);
      ctx.clip();
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, px, py, photoSize, photoSize);
      ctx.restore();
      rightEdge = px - 3 * MM;
    }

    const left = pad + 2 * MM;
    const topWidth = rightEdge - left;
    let y = pad + 3 * MM;

    // 組織名・部署・役職（あるものだけを上から詰めて描く）
    ctx.fillStyle = INK.sub;
    [[card.og, 32, 700], [card.dp, 27, 400], [card.tt, 27, 400]].forEach(([text, size, weight]) => {
      if (!text) return;
      fitText(ctx, text, topWidth, size, weight);
      ctx.fillText(text, left, y);
      y += 4.3 * MM;
    });

    // フリガナ・氏名
    const kana = fullKana(card);
    const nameY = Math.max(y + 7.5 * MM, 24 * MM);
    if (kana) {
      ctx.fillStyle = INK.sub;
      fitText(ctx, kana, topWidth, 24, 400);
      ctx.fillText(kana, left, nameY - 7 * MM);
    }
    ctx.fillStyle = '#111';
    const name = fullName(card);
    fitText(ctx, name, topWidth, 72, 700);
    ctx.fillText(name, left, nameY);

    // 下部：連絡先（左）とQR（右下）
    const qrSize = 17 * MM;
    const qrX = CARD_W - pad - qrSize + 1 * MM;
    const qrY = CARD_H - pad - qrSize + 2 * MM;
    if (options.qrUrl) drawQr(ctx, options.qrUrl, qrX, qrY, qrSize);

    const contacts = [];
    if (card.t1) contacts.push({ label: card.t1l || 'Tel', text: card.t1, uri: telUri(card.t1) });
    if (card.t2) contacts.push({ label: card.t2l || 'Tel', text: card.t2, uri: telUri(card.t2) });
    if (card.em) contacts.push({ label: 'E-mail', text: card.em, uri: 'mailto:' + card.em });
    if (card.ur) contacts.push({ label: 'Web', text: card.ur.replace(/^https?:\/\//, ''), uri: /^https?:\/\//.test(card.ur) ? card.ur : 'https://' + card.ur });

    // ラベル列の幅は一番長いラベルに合わせる
    const labelFont = `700 22px ${FONT}`;
    ctx.font = labelFont;
    const labelW = Math.min(12 * MM, Math.max(0, ...contacts.map((c) => ctx.measureText(c.label).width)));
    const tx = left + labelW + 2.5 * MM;
    const lineH = 4.3 * MM;
    const contactWidth = (options.qrUrl ? qrX - 3 * MM : CARD_W - pad) - tx;
    let cy = CARD_H - pad + 1 * MM - (contacts.length - 1) * lineH;
    contacts.forEach((c) => {
      ctx.fillStyle = INK.label;
      fitText(ctx, c.label, labelW, 22, 700);
      ctx.fillText(c.label, left, cy);
      ctx.fillStyle = '#222';
      const size = fitText(ctx, c.text, contactWidth, 28, 400);
      ctx.fillText(c.text, tx, cy);
      const w = ctx.measureText(c.text).width;
      links.push({ uri: c.uri, x: tx, y: cy - size, w, h: size * 1.3 });
      cy += lineH;
    });

    return links;
  }

  function telUri(tel) {
    return 'tel:' + tel.replace(/[^\d+]/g, '');
  }

  // ---- 出力ファイル生成 ---------------------------------------------------
  // 「会社名_氏名_受け取った日付」。保存した側が後で並べ替え・検索しやすい形にする
  function baseFileName(card, date = new Date()) {
    const ymd = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((n) => String(n).padStart(2, '0')).join('');
    return [card.og, fullName(card), ymd]
      .filter(Boolean)
      .map((s) => s.replace(/\s+/g, '').replace(/[\\/:*?"<>|_]/g, '-'))
      .join('_');
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  // vCard 3.0。フリガナは iOS / Android 双方が読む X-PHONETIC-* で入れ、
  // 電話の「代表」「研究室」などは iOS の独自ラベル（X-ABLabel）として付ける
  function makeVcard(card) {
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${esc(card.ln || '')};${esc(card.fn || '')};;;`,
      `FN:${esc(fullName(card))}`,
    ];
    if (card.lk) lines.push(`X-PHONETIC-LAST-NAME:${esc(card.lk)}`);
    if (card.fk) lines.push(`X-PHONETIC-FIRST-NAME:${esc(card.fk)}`);
    if (card.og || card.dp) lines.push(`ORG:${esc(card.og || '')}${card.dp ? ';' + esc(card.dp) : ''}`);
    if (card.tt) lines.push(`TITLE:${esc(card.tt)}`);
    ['t1', 't2'].forEach((k, i) => {
      if (!card[k]) return;
      lines.push(`item${i + 1}.TEL;TYPE=WORK,VOICE:${card[k]}`);
      if (card[k + 'l']) lines.push(`item${i + 1}.X-ABLabel:${esc(card[k + 'l'])}`);
    });
    if (card.em) lines.push(`EMAIL;TYPE=INTERNET,WORK:${card.em}`);
    if (card.ur) lines.push(`URL:${card.ur}`);
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  }

  /**
   * 名刺PNGを1ページに貼ったPDFを作る。
   * 日本語フォントを埋め込む代わりに画像を貼ることでファイルを小さく保ち、
   * 連絡先にはリンク注釈を重ね、vCardを添付ファイルとして同梱する。
   */
  async function makePdf(card, canvas, links) {
    const { PDFDocument, PDFName, PDFString } = PDFLib;
    const doc = await PDFDocument.create();
    const ptPerPx = 72 / 25.4 / MM; // px -> pt
    const pageW = CARD_W * ptPerPx;
    const pageH = CARD_H * ptPerPx;
    const page = doc.addPage([pageW, pageH]);

    const pngBytes = new Uint8Array(await (await canvasToPngBlob(canvas)).arrayBuffer());
    const png = await doc.embedPng(pngBytes);
    page.drawImage(png, { x: 0, y: 0, width: pageW, height: pageH });

    const annots = links.map((l) => doc.context.register(doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [l.x * ptPerPx, pageH - (l.y + l.h) * ptPerPx, (l.x + l.w) * ptPerPx, pageH - l.y * ptPerPx],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(l.uri) },
    })));
    if (annots.length) page.node.set(PDFName.of('Annots'), doc.context.obj(annots));

    await doc.attach(new TextEncoder().encode(makeVcard(card)), `${baseFileName(card)}.vcf`, {
      mimeType: 'text/vcard',
      description: '連絡先データ（vCard）',
    });

    doc.setTitle(`${fullName(card)} の名刺`);
    doc.setSubject([card.og, card.tt].filter(Boolean).join(' / '));
    doc.setCreator('デジタル名刺');
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  // ---- 共有と保存 ---------------------------------------------------------
  // 共有シートが使える端末ではそれを開き（写真・ファイルへ保存、AirDrop等）、
  // 使えない端末ではダウンロードに切り替える
  async function shareOrDownload(blob, fileName, title) {
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
      }
    }
    download(blob, fileName);
    return 'downloaded';
  }

  function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  global.Meishi = {
    FIELDS, THEMES, FONTS, loadFonts, cardText, encodeCard, decodeCard, fullName, renderQrCanvas,
    drawCard, canvasToPngBlob, makeVcard, makePdf, baseFileName,
    shareOrDownload, download,
  };
})(window);
