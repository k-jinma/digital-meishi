/* receiver.js — 受け手画面：URLフラグメントから名刺を復元し、保存方法を選ばせる */
(async function () {
  'use strict';
  const canvas = document.getElementById('card');
  const status = document.getElementById('status');
  const buttons = document.querySelectorAll('[data-save]');

  let card;
  try {
    card = Meishi.decodeCard(location.hash);
  } catch (e) {
    document.getElementById('heading').textContent = '名刺を読み込めませんでした';
    status.textContent = 'QRコードをもう一度読み取ってください。';
    status.classList.add('error');
    buttons.forEach((b) => { b.disabled = true; });
    return;
  }

  const name = Meishi.fullName(card);
  const fileBase = Meishi.baseFileName(card);
  const title = `${name} の名刺`;
  document.title = title;
  document.getElementById('heading').textContent = `${name} さんの名刺`;
  document.getElementById('file-name').textContent = fileBase + '.pdf';

  // 送り手が選んだ書体を読み込んでから描く。名刺に印字するQRはこのページ自身のURL
  // （保存した画像からも再度開ける）
  await Meishi.loadFonts([card.ft], Meishi.cardText(card));
  const links = Meishi.drawCard(canvas, card, { qrUrl: location.href });

  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      buttons.forEach((b) => { b.disabled = true; });
      status.textContent = '作成中…';
      try {
        let result;
        switch (btn.dataset.save) {
          case 'png':
            result = await Meishi.shareOrDownload(await Meishi.canvasToPngBlob(canvas), fileBase + '.png', title);
            break;
          case 'pdf':
            result = await Meishi.shareOrDownload(await Meishi.makePdf(card, canvas, links), fileBase + '.pdf', title);
            break;
          case 'vcf':
            // vCard は共有シートより直接開いた方が「連絡先に追加」画面に進みやすい
            Meishi.download(new Blob([Meishi.makeVcard(card)], { type: 'text/vcard' }), fileBase + '.vcf');
            result = 'downloaded';
            break;
        }
        status.textContent = {
          shared: '共有シートから「画像を保存」または「“ファイル”に保存」を選んでください。',
          downloaded: '保存しました。',
          cancelled: '',
        }[result];
      } catch (e) {
        status.textContent = '作成に失敗しました：' + e.message;
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  });
})();
