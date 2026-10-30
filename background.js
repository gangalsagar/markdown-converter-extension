// background service worker
let pendingPdf = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'pdf-dropped') {
    pendingPdf = {
      name: msg.name || 'document.pdf',
      data: msg.data, // number[]
      size: msg.size || 0,
      ts: Date.now()
    };
    // notify any open side panel
    try { chrome.runtime.sendMessage({ type: 'new-pdf-available' }).catch(() => {}); } catch (e) {}
    // try to open side panel for the window
    const windowId = sender.tab ? sender.tab.windowId : undefined;
    const openPanel = async () => {
      try {
        if (windowId) await chrome.sidePanel.open({ windowId });
        else await chrome.sidePanel.open({});
        return;
      } catch (e) {
        // sidePanel.open requires a user gesture; fall back below
      }
      // fallback: open/focus a tab with the side panel page
      try {
        const url = chrome.runtime.getURL('sidepanel.html');
        const tabs = await chrome.tabs.query({ url });
        if (tabs && tabs.length) {
          await chrome.tabs.update(tabs[0].id, { active: true });
          if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
          await chrome.tabs.create({ url, active: true });
        }
      } catch (e2) {
        console.warn('tabs fallback failed', e2);
      }
    };
    openPanel();
    sendResponse({ ok: true });
    return true;
  }

  if (msg && msg.type === 'get-pending-pdf') {
    const p = pendingPdf;
    pendingPdf = null; // consume once
    sendResponse({ pdf: p });
    return true;
  }

  if (msg && msg.type === 'set-pending-pdf') {
    pendingPdf = msg.pdf;
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab && tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    console.warn(e);
  }
});
