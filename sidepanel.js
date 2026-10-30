import * as pdfjsLib from './lib/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const previewWrap = document.getElementById('previewWrap');
const preview = document.getElementById('preview');
const fileNameEl = document.getElementById('fileName');
const pageCountEl = document.getElementById('pageCount');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');

let currentMarkdown = '';
let currentFileName = 'document.md';

function setStatus(msg, kind = 'info') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + kind;
  statusEl.classList.remove('hidden');
}

function enableActions(enabled) {
  copyBtn.disabled = !enabled;
  downloadBtn.disabled = !enabled;
}

// ---------- PDF -> Markdown conversion (pdf.js + markitdown-inspired) ----------

const PARTIAL_NUMBERING = /^\.\d+$/;

function fontSizeOf(item) {
  const t = item.transform || [];
  const size = Math.hypot(t[2] || 0, t[3] || 0) || Math.abs(t[0] || 0) || 0;
  return size || 12;
}

function isBold(item, styles) {
  const name = (item.fontName || '').toLowerCase();
  if (name.includes('bold')) return true;
  const st = styles && styles[item.fontName];
  if (st && /bold/i.test(st.fontFamily || '')) return true;
  return false;
}

function buildLines(items, styles) {
  const sorted = items.slice().sort((a, b) => {
    const ya = a.transform ? a.transform[5] : 0;
    const yb = b.transform ? b.transform[5] : 0;
    if (Math.abs(ya - yb) > 3) return yb - ya;
    const xa = a.transform ? a.transform[4] : 0;
    const xb = b.transform ? b.transform[4] : 0;
    return xa - xb;
  });

  const lines = [];
  let cur = null;
  for (const item of sorted) {
    if (!item.str) {
      if (item.hasEOL && cur) { lines.push(cur); cur = null; }
      continue;
    }
    const y = item.transform ? item.transform[5] : 0;
    const x = item.transform ? item.transform[4] : 0;
    const w = item.width || 0;
    const sz = fontSizeOf(item);
    const bd = isBold(item, styles);
    if (!cur || Math.abs(y - cur.y) > 3) {
      if (cur) lines.push(cur);
      cur = { y, items: [item], x0: x, x1: x + w, text: item.str, size: sz, bold: bd };
    } else {
      const gap = x - cur.x1;
      if (gap > 2 && !cur.text.endsWith(' ') && !item.str.startsWith(' ')) cur.text += ' ';
      cur.text += item.str;
      cur.items.push(item);
      cur.x0 = Math.min(cur.x0, x);
      cur.x1 = Math.max(cur.x1, x + w);
      cur.size = Math.max(cur.size, sz);
      cur.bold = cur.bold && bd;
    }
    if (item.hasEOL) { if (cur) { lines.push(cur); cur = null; } }
  }
  if (cur) lines.push(cur);
  return lines.filter((l) => l.text.trim().length > 0).map((l) => ({ ...l, text: l.text.trim() }));
}

function mergePartialNumbering(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const stripped = lines[i].text.trim();
    if (PARTIAL_NUMBERING.test(stripped)) {
      let j = i + 1;
      while (j < lines.length && !lines[j].text.trim()) j++;
      if (j < lines.length) {
        out.push({ ...lines[i], text: stripped + ' ' + lines[j].text.trim() });
        i = j + 1;
        continue;
      }
    }
    out.push(lines[i]);
    i++;
  }
  return out;
}

function clusterColumns(xs, tolerance) {
  const sorted = xs.slice().sort((a, b) => a - b);
  const cols = [];
  for (const x of sorted) {
    if (!cols.length || x - cols[cols.length - 1] > tolerance) cols.push(x);
  }
  return cols;
}

function convertPage(items, styles, pageWidth) {
  const lines = mergePartialNumbering(buildLines(items, styles));
  if (!lines.length) return '';

  // Determine table rows: lines with >=2 distinct x groups, not paragraphs
  const rowInfo = lines.map((ln) => {
    const groups = [];
    for (const it of ln.items) {
      const x = it.transform ? it.transform[4] : 0;
      if (!groups.length || x - groups[groups.length - 1] > 40) groups.push(x);
    }
    const isParagraph = ln.x1 - ln.x0 > pageWidth * 0.55 && ln.text.length > 60;
    const hasPartial = PARTIAL_NUMBERING.test(ln.text.trim().split(/\s/)[0]);
    const isTableRow = !isParagraph && !hasPartial && groups.length >= 2;
    return { line: ln, groups, isParagraph, isTableRow };
  });

  // Collect x positions from table rows
  const tableXs = [];
  for (const r of rowInfo) {
    if (r.isTableRow) for (const g of r.groups) tableXs.push(g);
  }

  // Only attempt table extraction if enough table rows
  const tableRowCount = rowInfo.filter((r) => r.isTableRow).length;
  let globalColumns = null;
  if (tableRowCount >= 3 && tableXs.length) {
    // adaptive tolerance
    const sortedXs = tableXs.slice().sort((a, b) => a - b);
    const gaps = [];
    for (let i = 0; i < sortedXs.length - 1; i++) {
      const g = sortedXs[i + 1] - sortedXs[i];
      if (g > 5) gaps.push(g);
    }
    let tol = 35;
    if (gaps.length >= 3) {
      const sg = gaps.slice().sort((a, b) => a - b);
      tol = sg[Math.floor(sg.length * 0.7)];
      tol = Math.max(25, Math.min(50, tol));
    }
    globalColumns = clusterColumns(tableXs, tol);
    if (globalColumns.length < 2 || globalColumns.length > 12) globalColumns = null;
    // density check
    if (globalColumns && globalColumns.length > 1) {
      const contentWidth = globalColumns[globalColumns.length - 1] - globalColumns[0];
      const avgCol = contentWidth / globalColumns.length;
      if (avgCol < 25) globalColumns = null;
    }
  }

  // Identify table regions (consecutive table rows)
  const regions = [];
  let i = 0;
  while (i < rowInfo.length) {
    if (rowInfo[i].isTableRow && globalColumns) {
      const start = i;
      while (i < rowInfo.length && rowInfo[i].isTableRow) i++;
      regions.push([start, i]);
    } else {
      i++;
    }
  }

  // Validate: at least 20% table rows
  if (globalColumns && regions.length) {
    const totalTR = regions.reduce((s, r) => s + (r[1] - r[0]), 0);
    if (totalTR / rowInfo.length < 0.2) globalColumns = null;
  }

  const out = [];
  const numCols = globalColumns ? globalColumns.length : 0;

  function assignCol(x) {
    let col = numCols - 1;
    for (let c = 0; c < numCols - 1; c++) {
      if (x < globalColumns[c + 1] - 20) { col = c; break; }
    }
    return col;
  }

  let idx = 0;
  while (idx < rowInfo.length) {
    // check if start of a region
    const region = regions.find((r) => r[0] === idx);
    if (region && globalColumns) {
      const [start, end] = region;
      const tableData = [];
      for (let r = start; r < end; r++) {
        const cells = new Array(numCols).fill('');
        for (const it of rowInfo[r].line.items) {
          const x = it.transform ? it.transform[4] : 0;
          const col = assignCol(x);
          if (cells[col]) cells[col] += ' ' + it.str;
          else cells[col] = it.str;
        }
        tableData.push(cells);
      }
      // quality check: long cells
      let long = 0, total = 0;
      for (const row of tableData) for (const c of row) if (c.trim()) { total++; if (c.trim().length > 30) long++; }
      if (total > 0 && long / total > 0.3) {
        // not a real table; emit as text
        for (let r = start; r < end; r++) out.push(formatLine(rowInfo[r].line));
        idx = end;
        continue;
      }
      if (tableData.length < 2) {
        for (let r = start; r < end; r++) out.push(formatLine(rowInfo[r].line));
        idx = end;
        continue;
      }
      // render markdown table
      const widths = new Array(numCols).fill(3);
      for (const row of tableData) for (let c = 0; c < numCols; c++) widths[c] = Math.max(widths[c], (row[c] || '').length);
      const header = tableData[0];
      out.push('| ' + header.map((c, cIdx) => (c || '').padEnd(widths[cIdx])).join(' | ') + ' |');
      out.push('| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |');
      for (let r = 1; r < tableData.length; r++) {
        out.push('| ' + tableData[r].map((c, cIdx) => (c || '').padEnd(widths[cIdx])).join(' | ') + ' |');
      }
      idx = end;
    } else {
      // skip if inside region (handled)
      let inRegion = false;
      for (const r of regions) if (r[0] < idx && idx < r[1]) { inRegion = true; break; }
      if (!inRegion) out.push(formatLine(rowInfo[idx].line));
      idx++;
    }
  }

  return out.join('\n').trim();
}

function formatLine(line) {
  const t = line.text;
  if (line.size >= 18 && t.length <= 120) return '## ' + t;
  if (line.size >= 15 && t.length <= 80 && line.bold) return '### ' + t;
  if (line.bold && t.length <= 200) return '**' + t + '**';
  return t;
}

async function convertPdf(arrayBuffer, name) {
  setStatus('Reading PDF…', 'info');
  enableActions(false);
  previewWrap.classList.add('hidden');
  currentMarkdown = '';

  const data = new Uint8Array(arrayBuffer);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  const meta = await pdf.getMetadata().catch(() => ({}));
  const info = (meta && meta.info) || {};
  const title = info.Title || '';
  const author = info.Author || '';

  const parts = [];
  if (title) parts.push('# ' + title + '\n');
  if (author) parts.push('_Author: ' + author + '_\n');

  const totalPages = pdf.numPages;
  for (let i = 1; i <= totalPages; i++) {
    setStatus(`Converting page ${i} of ${totalPages}…`, 'info');
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });
    const pageMd = convertPage(content.items, content.styles, viewport.width);
    parts.push(`\n---\n\n## Page ${i}\n\n${pageMd}\n`);
  }

  currentMarkdown = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  currentFileName = (name || 'document').replace(/\.pdf$/i, '') + '.md';

  fileNameEl.textContent = name || 'document.pdf';
  pageCountEl.textContent = totalPages + ' page' + (totalPages === 1 ? '' : 's');
  preview.textContent = currentMarkdown;
  previewWrap.classList.remove('hidden');
  enableActions(true);
  setStatus('Conversion complete.', 'success');
  await copyToClipboard(currentMarkdown);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Copied Markdown to clipboard.', 'success');
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setStatus('Copied Markdown to clipboard.', 'success');
    } catch (err) {
      setStatus('Could not copy automatically: ' + err.message, 'error');
    }
  }
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    setStatus('Please drop a PDF file.', 'error');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    await convertPdf(buf, file.name);
  } catch (e) {
    console.error(e);
    setStatus('Failed to convert: ' + (e && e.message ? e.message : e), 'error');
  }
}

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) handleFile(files[0]);
});
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) handleFile(f);
  fileInput.value = '';
});

copyBtn.addEventListener('click', async () => {
  if (currentMarkdown) await copyToClipboard(currentMarkdown);
});
downloadBtn.addEventListener('click', () => {
  if (!currentMarkdown) return;
  const blob = new Blob([currentMarkdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

async function checkPending() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'get-pending-pdf' });
    if (res && res.pdf) {
      const p = res.pdf;
      const buf = new Uint8Array(p.data).buffer;
      await convertPdf(buf, p.name);
    }
  } catch (e) {
    console.warn('pending check failed', e);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'new-pdf-available') {
    checkPending();
  }
});

checkPending();
setTimeout(checkPending, 500);
