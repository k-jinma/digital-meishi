/* sender.js — 送り手画面：名刺を渡す（メニュー・横向き表示）と名刺の編集 */
(function () {
  'use strict';
  const { FIELDS, THEMES, FONTS } = Meishi;
  const STORE_KEY = 'meishi.sender.v2';
  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const preview = $('preview');
  const editPreview = $('edit-preview');
  const baseUrlInput = $('base-url');
  const photoInput = $('photo');
  const usePhoto = $('use-photo');
  const directStatus = $('direct-status');

  let state = load();
  let photoImg = null;

  // ---- 保存と復元（localStorage が使えない環境でも動くようにする） ----
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      // 容量超過やプライベートモードでは保存しない
    }
  }

  // ---- 入力フォーム（所属・氏名・連絡先の3グループ） -----------------------
  // 初期値は空にし、入力例は placeholder で示す
  const GROUPS = [
    ['所属', ['og', 'dp', 'tt']],
    ['氏名', ['ln', 'fn', 'lk', 'fk']],
    ['連絡先', ['t1', 't2', 'em', 'ur']],
    ['所在地', ['zp', 'ad']],
  ];
  // 以前の版で初期値として保存された架空のサンプルは消しておく
  if (state.values && state.values.em === 'yamada@example.ac.jp') state.values = null;
  state.values = state.values || {};
  state.enabled = state.enabled || {};
  state.th = THEMES[state.th] ? state.th : 'navy';
  state.ft = FONTS[state.ft] ? state.ft : 'gothic';

  GROUPS.forEach(([title, keys]) => {
    const h = document.createElement('h2');
    h.className = 'section-title';
    h.textContent = title;
    const block = document.createElement('div');
    block.className = 'block stack';
    keys.forEach((key) => block.appendChild(fieldRow(FIELDS.find((f) => f.key === key))));
    form.append(h, block);
  });

  function fieldRow(f) {
    const id = 'f-' + f.key;
    const enabled = f.required || state.enabled[f.key] !== false;
    const row = document.createElement('div');
    row.className = 'form-row' + (enabled ? '' : ' off');
    const input = `<input type="${f.type || 'text'}" id="${id}" data-key="${f.key}" placeholder="${f.placeholder || ''}">`;
    row.innerHTML = `
      <label class="label" for="${id}">${f.label}${f.required ? '（必須）' : ''}</label>
      <div class="line">
        <input type="checkbox" ${enabled ? 'checked' : ''} ${f.required ? 'disabled' : ''}
               aria-label="${f.label}を載せる" data-toggle="${f.key}">
        ${f.labelKey ? `<input type="text" class="input name" data-key="${f.labelKey}"
               aria-label="${f.label}の名前" placeholder="${f.defaultLabel}">` : ''}
        ${input}
      </div>`;
    row.querySelectorAll('[data-key]').forEach((el) => {
      el.value = state.values[el.dataset.key] ?? (el.dataset.key === f.labelKey ? f.defaultLabel : '');
    });
    return row;
  }

  form.addEventListener('input', (e) => {
    if (e.target.dataset.key) state.values[e.target.dataset.key] = e.target.value.trim();
    update();
  });
  form.addEventListener('change', (e) => {
    const key = e.target.dataset.toggle;
    if (!key) return;
    state.enabled[key] = e.target.checked;
    e.target.closest('.form-row').classList.toggle('off', !e.target.checked);
    update();
  });

  // ---- 名刺のデザイン（左ラインの色・書体・写真） --------------------------
  Object.entries(THEMES).forEach(([key, t]) => {
    const l = document.createElement('label');
    l.className = 'swatch';
    l.innerHTML = `<input type="radio" name="theme" value="${key}" ${key === state.th ? 'checked' : ''}>
      <span class="chip" style="--c:${t.line}"></span><span class="name">${t.label}</span>`;
    $('themes').appendChild(l);
  });
  Object.entries(FONTS).forEach(([key, f]) => {
    const l = document.createElement('label');
    l.className = 'font-option';
    l.innerHTML = `<input type="radio" name="font" value="${key}" ${key === state.ft ? 'checked' : ''}>
      <span class="sample" style="font-family:'${f.family}', ${f.fallback}">${escapeHtml(sampleName())}</span>
      <span class="fname">${f.label}（${f.family}）</span>`;
    $('fonts').appendChild(l);
  });
  $('themes').addEventListener('change', (e) => { state.th = e.target.value; update(); });
  $('fonts').addEventListener('change', (e) => { state.ft = e.target.value; update(); });

  function sampleName() {
    return [state.values.ln, state.values.fn].filter(Boolean).join(' ') || '山田 花子';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  baseUrlInput.value = state.baseUrl || '';
  baseUrlInput.addEventListener('input', () => { state.baseUrl = baseUrlInput.value.trim(); update(); });
  usePhoto.checked = !!state.usePhoto;
  usePhoto.addEventListener('change', () => { state.usePhoto = usePhoto.checked; update(); });

  if (state.photo) {
    const img = new Image();
    img.onload = () => { photoImg = img; update(); };
    img.src = state.photo;
  }

  // 写真は 360px 四方に縮小してから保存する
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const size = 360;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      c.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      state.photo = c.toDataURL('image/jpeg', 0.85);
      state.usePhoto = usePhoto.checked = true;
      const small = new Image();
      small.onload = () => { photoImg = small; update(); };
      small.src = state.photo;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });

  // ---- 名刺データとURL ----------------------------------------------------
  function currentCard() {
    const card = { th: state.th, ft: state.ft };
    FIELDS.forEach((f) => {
      const enabled = f.required || state.enabled[f.key] !== false;
      if (!enabled || !state.values[f.key]) return;
      card[f.key] = state.values[f.key];
      if (f.labelKey) card[f.labelKey] = state.values[f.labelKey] || f.defaultLabel;
    });
    return card;
  }

  function receiverUrl(card) {
    // アプリでは受け取りページの公開URL（config.js）を使う
    const base = state.baseUrl || Meishi.CONFIG.receiverBase || new URL('card.html', location.href).href;
    return base.split('#')[0] + '#' + Meishi.encodeCard(card);
  }

  // 書体の読み込みを待ってから描くので、連続入力では最後の描画だけを反映する
  let links = [];
  let drawSeq = 0;
  async function update() {
    const seq = ++drawSeq;
    const card = currentCard();
    if (!card.ln) card.ln = '（氏名）';
    save();
    await Meishi.loadFonts([card.ft], Meishi.cardText(card));
    if (seq !== drawSeq) return;
    links = Meishi.drawCard(preview, card, {
      qrUrl: receiverUrl(card),
      photo: state.usePhoto ? photoImg : null,
    });
    editPreview.width = preview.width;
    editPreview.height = preview.height;
    editPreview.getContext('2d').drawImage(preview, 0, 0);
  }

  // ---- タブ切り替え -------------------------------------------------------
  function showTab(name) {
    ['present', 'edit'].forEach((t) => {
      $('tab-' + t).hidden = t !== name;
      $('tabbtn-' + t).setAttribute('aria-selected', String(t === name));
    });
    window.scrollTo(0, 0);
  }
  $('tabbtn-present').addEventListener('click', () => showTab('present'));
  $('tabbtn-edit').addEventListener('click', () => showTab('edit'));
  $('save').addEventListener('click', () => { save(); showTab('present'); });

  // ---- バックアップ（書き出しと復元） ---------------------------------------
  // 端末内の保存データ（state）をそのままファイルにする。サーバーには送らない
  const BACKUP_APP = 'digital-meishi';
  const backupStatus = $('backup-status');

  $('backup-export').addEventListener('click', async () => {
    const d = new Date();
    const ymd = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('');
    const data = { app: BACKUP_APP, version: 1, savedAt: d.toISOString(), state };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    try {
      const result = await Meishi.shareOrDownload(blob, `デジタル名刺_バックアップ_${ymd}.json`, 'デジタル名刺のバックアップ');
      backupStatus.textContent = { shared: 'バックアップを書き出しました。', downloaded: 'バックアップを保存しました。', cancelled: '' }[result];
    } catch (e) {
      backupStatus.textContent = 'バックアップを作れませんでした：' + e.message;
    }
  });

  $('backup-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const restored = parseBackup(await file.text());
      if (!confirm('いまの入力内容をバックアップの内容で置き換えます。よろしいですか？')) return;
      state = restored;
      save();
      // 端末に保存できない環境（プライベートブラウズなど）では、読み込み直すと消えてしまう
      if (JSON.stringify(load()) !== JSON.stringify(state)) {
        backupStatus.textContent = 'この端末には保存できないため、復元できませんでした。通常のブラウズで開いてください。';
        return;
      }
      location.reload(); // 画面を作り直して復元した内容を反映する
    } catch (err) {
      backupStatus.textContent = 'このファイルからは復元できません：' + err.message;
    }
  });

  // 知らない項目や不正な値は取り込まない
  function parseBackup(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('JSONとして読めません');
    }
    if (!data || data.app !== BACKUP_APP || data.version !== 1 || typeof data.state !== 'object') {
      throw new Error('デジタル名刺のバックアップではありません');
    }
    const src = data.state;
    const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    const keys = FIELDS.flatMap((f) => (f.labelKey ? [f.key, f.labelKey] : [f.key]));
    const restored = { values: {}, enabled: {} };
    keys.forEach((k) => {
      const v = str(src.values && src.values[k]);
      if (v !== undefined) restored.values[k] = v;
      if (src.enabled && typeof src.enabled[k] === 'boolean') restored.enabled[k] = src.enabled[k];
    });
    if (THEMES[src.th]) restored.th = src.th;
    if (FONTS[src.ft]) restored.ft = src.ft;
    restored.usePhoto = src.usePhoto === true;
    const photo = str(src.photo, 2000000);
    if (photo && photo.startsWith('data:image/')) restored.photo = photo;
    const baseUrl = str(src.baseUrl, 500);
    if (baseUrl && /^https?:\/\//.test(baseUrl)) restored.baseUrl = baseUrl;
    return restored;
  }

  // ---- 名刺を見せる（横向き表示） -----------------------------------------
  const present = $('present');
  let wakeLock = null;
  let savedBrightness = null;
  let qrMode = 'url'; // url：受け取りページ（保存方法を選べる） / vcard：連絡先QR（ネット接続不要）

  // QRと説明文を、受け取り方に合わせて切り替える
  function renderPresentQr(card) {
    const offline = qrMode === 'vcard';
    Meishi.renderQrCanvas($('present-qr'), offline ? Meishi.makeVcard(card) : receiverUrl(card));
    $('qr-title').innerHTML = offline ? '<span>カメラで読み取って</span><span>連絡先に追加</span>' : 'QRを読み取って保存';
    $('qr-sub').innerHTML = offline
      ? '<span>ネット接続なしで使えます</span><span>（連絡先への追加のみ）</span>'
      : '<span>画像・PDF・連絡先から</span><span>保存方法を選べます</span><span>（アプリ・登録不要）</span>';
    $('qr-mode').textContent = offline ? '通常のQRに戻す' : '相手がオフラインのとき';
    $('qr-mode').setAttribute('aria-pressed', String(offline));
  }

  $('open-present').addEventListener('click', async () => {
    const card = currentCard();
    if (!card.ln) {
      showTab('edit');
      return;
    }
    await Meishi.loadFonts([card.ft], Meishi.cardText(card));
    // 名刺側にはQRを入れず、読み取る場所を右側の1つにする
    Meishi.drawCard($('present-card'), card, { photo: state.usePhoto ? photoImg : null });
    qrMode = 'url';
    renderPresentQr(card);
    present.classList.remove('flip');
    present.hidden = false;
    if (Meishi.isNative) await enterPresentNative();
    else await enterPresentWeb();
  });

  // アプリ：横向きに固定し、画面を最大の明るさにしてQRを読み取りやすくし、スリープさせない
  async function enterPresentNative() {
    const orientation = Meishi.plugin('ScreenOrientation');
    const brightness = Meishi.plugin('ScreenBrightness');
    const keepAwake = Meishi.plugin('KeepAwake');
    await Promise.all([
      orientation && orientation.lock({ orientation: 'landscape' }).catch(() => {}),
      brightness && brightness.getBrightness()
        .then(({ brightness: b }) => { savedBrightness = b; return brightness.setBrightness({ brightness: 1 }); })
        .catch(() => {}),
      keepAwake && keepAwake.keepAwake().catch(() => {}),
    ]);
  }

  async function leavePresentNative() {
    const orientation = Meishi.plugin('ScreenOrientation');
    const brightness = Meishi.plugin('ScreenBrightness');
    const keepAwake = Meishi.plugin('KeepAwake');
    await Promise.all([
      orientation && orientation.lock({ orientation: 'portrait' }).catch(() => {}),
      brightness && savedBrightness !== null && brightness.setBrightness({ brightness: savedBrightness }).catch(() => {}),
      keepAwake && keepAwake.allowSleep().catch(() => {}),
    ]);
    savedBrightness = null;
  }

  // Web版：Android では全画面にして横向きに固定できる。iPhone は固定できないので、
  // 縦持ちのときは CSS で表示を90°回して対応する
  async function enterPresentWeb() {
    try {
      if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (e) {
      // 対応していない端末では回転表示のまま使う
    }
    // 見せている間に画面が消えないようにする
    try {
      if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      wakeLock = null;
    }
  }

  async function leavePresentWeb() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (e) {
      // 何もしない
    }
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  $('flip').addEventListener('click', () => present.classList.toggle('flip'));
  $('qr-mode').addEventListener('click', () => {
    qrMode = qrMode === 'url' ? 'vcard' : 'url';
    renderPresentQr(currentCard());
  });

  async function closePresent() {
    present.hidden = true;
    if (Meishi.isNative) await leavePresentNative();
    else await leavePresentWeb();
  }
  $('close-present').addEventListener('click', closePresent);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !present.hidden) closePresent(); });

  // ---- QRコードを使わずに渡す ----------------------------------------------
  // 氏名が未入力のままでは渡せないので、編集画面の姓の欄へ案内する
  function requireName(card) {
    if (card.ln) return true;
    showTab('edit');
    $('f-ln').focus();
    return false;
  }

  $('share-url').addEventListener('click', async () => {
    const card = currentCard();
    if (!requireName(card)) return;
    const url = receiverUrl(card);
    if (Meishi.isNative) {
      await Meishi.plugin('Share').share({ title: `${Meishi.fullName(card)} の名刺`, url }).catch(() => {});
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: `${Meishi.fullName(card)} の名刺`, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      directStatus.textContent = 'URLをコピーしました。';
    } catch (e) {
      prompt('このURLを相手に送ってください', url);
    }
  });

  $('open-receiver').addEventListener('click', () => {
    const card = currentCard();
    if (!requireName(card)) return;
    window.open(receiverUrl(card), '_blank');
  });

  document.querySelectorAll('[data-direct]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = currentCard();
      if (!card.ln) {
        directStatus.textContent = '氏名（姓）を入力してください。';
        return;
      }
      await update();
      const name = Meishi.baseFileName(card);
      const title = `${Meishi.fullName(card)} の名刺`;
      directStatus.textContent = '作成中…';
      try {
        let result;
        if (btn.dataset.direct === 'png') {
          result = await Meishi.shareOrDownload(await Meishi.canvasToPngBlob(preview), name + '.png', title);
        } else if (btn.dataset.direct === 'pdf') {
          result = await Meishi.shareOrDownload(await Meishi.makePdf(card, preview, links), name + '.pdf', title);
        } else {
          const vcf = new Blob([Meishi.makeVcard(card)], { type: 'text/vcard' });
          result = await Meishi.shareOrDownload(vcf, name + '.vcf', title);
        }
        directStatus.textContent = { shared: '共有しました。', downloaded: 'ファイルを保存しました。', cancelled: '' }[result];
      } catch (e) {
        directStatus.textContent = '作成に失敗しました：' + e.message;
      }
    });
  });

  // 書体の見本を表示するため、5書体とも読み込んでおく
  Meishi.loadFonts(Object.keys(FONTS), sampleName() + 'ゴシック明朝丸UD').then(update);
  update();
  // アプリでは通常の画面を縦向きに固定する（横向きは名刺を見せるときだけ）
  if (Meishi.isNative) {
    const orientation = Meishi.plugin('ScreenOrientation');
    if (orientation) orientation.lock({ orientation: 'portrait' }).catch(() => {});
  }
  // 初めて開いたとき（氏名が未入力）は編集画面から始める
  if (!state.values.ln) showTab('edit');

  // オフライン対応の Service Worker は Web版だけ（アプリは最初から端末内にある）
  if (!Meishi.isNative && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
