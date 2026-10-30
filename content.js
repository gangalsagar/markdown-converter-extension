// content script: capture PDF drops on any page
(function () {
  'use strict';

  function isPdf(file) {
    if (!file) return false;
    const name = (file.name || '').toLowerCase();
    return file.type === 'application/pdf' || name.endsWith('.pdf');
  }

  function showToast(text) {
    try {
      let t = document.getElementById('__pdf2md_toast__');
      if (!t) {
        t = document.createElement('div');
        t.id = '__pdf2md_toast__';
        t.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#1f2937;color:#fff;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;max-width:320px;';
        document.documentElement.appendChild(t);
      }
      t.textContent = text;
      t.style.opacity = '1';
      clearTimeout(t._timer);
      t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
    } catch (e) {}
  }

  async function handleDrop(e) {
    const dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;
    const pdfs = Array.from(dt.files).filter(isPdf);
    if (!pdfs.length) return; // let page handle non-pdf
    e.preventDefault();
    e.stopPropagation();
    for (const file of pdfs) {
      showToast('Captured ' + file.name + ' — opening converter…');
      try {
        const buf = await file.arrayBuffer();
        chrome.runtime.sendMessage({
          type: 'pdf-dropped',
          name: file.name,
          size: file.size,
          data: Array.from(new Uint8Array(buf))
        });
      } catch (err) {
        console.error('pdf2md send failed', err);
        showToast('Failed to send PDF: ' + (err && err.message));
      }
    }
  }

  function handleDragOver(e) {
    const dt = e.dataTransfer;
    if (!dt) return;
    // Only claim drops that include files
    if (!dt.types || !Array.from(dt.types).includes('Files')) return;
    // If we can tell none are PDFs, leave it to the page
    try {
      const items = dt.items ? Array.from(dt.items) : [];
      const hasPdf = items.some((it) => {
        if (it.kind !== 'file') return false;
        const t = (it.type || '').toLowerCase();
        if (t === 'application/pdf') return true;
        // name not available during drag; allow if type unknown
        return t === '' ;
      });
      if (!hasPdf && items.length && items.every((it) => it.type && it.type !== 'application/pdf')) {
        return;
      }
    } catch (e) {}
    e.preventDefault();
  }

  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('drop', handleDrop, true);
})();
