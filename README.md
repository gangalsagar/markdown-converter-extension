# PDF to Markdown Converter (Browser Extension)

Convert any PDF to clean, token-efficient Markdown in one drag-and-drop — right in your browser.

## Why this exists

Uploading raw PDFs into Claude, ChatGPT, Gemini, and other AI tools burns context tokens on layout noise, metadata, and embedded formatting. This extension extracts the text **locally** with pdf.js, preserves headings/tables/lists, and copies lean Markdown to your clipboard — so you paste only what matters, cutting token usage and keeping conversations longer.

## Features

- 📄 **Drag & drop a PDF on any page** → instant Markdown, no server, no upload.
- ✂️ **Token-efficient** — Markdown instead of a PDF means smaller prompts and cheaper API calls.
- 🔒 **Private** — 100% client-side conversion with pdf.js.
- ⚡ **Auto-copy** to clipboard, plus a preview and **Download .md** in the side panel.
- 🧠 **LLM-friendly output** — headings, tables, lists, and page breaks preserved.
- 🖱️ **Side panel** — drag/drop or click to choose a file manually.

## Installation

### Chrome / Edge / Brave / Opera

1. Download or clone this repository:
   ```bash
   git clone https://github.com/<your-username>/pdf-to-markdown-extension.git
   ```
2. Open your browser and go to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top-right).
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json` (the repo root).
6. (Optional) Pin the extension and click its icon to open the side panel.

### Firefox

Firefox uses Manifest V2 by default for side panels; this extension targets MV3 side-panel APIs. For Firefox, use a Chromium-based browser (Chrome/Edge/Brave) or wait for a Firefox build.

## Usage

### On any web page
1. Drag a `.pdf` file onto the page and drop it.
2. A toast confirms capture; the side panel opens automatically.
3. The Markdown is copied to your clipboard — paste it into Claude, ChatGPT, Gemini, etc.
4. Use **Copy** / **Download .md** in the panel as needed.

### In the side panel
1. Click the extension icon to open the side panel.
2. Drag & drop a PDF onto the drop zone, or click it to choose a file.
3. Preview the converted Markdown, then copy or download.

## Permissions

| Permission | Why |
|---|---|
| `sidePanel` | Open the converter side panel |
| `storage` | Reserved for future settings |
| `downloads` | Download the `.md` file |
| `clipboardWrite` | Copy Markdown to clipboard |
| `tabs` | Focus/open the side-panel tab |
| `<all_urls>` | Inject the drag-and-drop capture on pages |

## Tech stack

- Manifest V3
- pdf.js (bundled in `lib/`) for client-side PDF parsing
- Vanilla JS, no build step

## Project structure

```
.
├── manifest.json
├── background.js        # service worker
├── content.js           # page drag-and-drop capture
├── sidepanel.html/.css/.js
├── popup.html/.js
├── icons/
├── lib/                 # pdf.js
└── README.md
```

## Contributing

Issues and PRs welcome. To test locally, reload the extension from `chrome://extensions` after editing files.

## License

MIT
