document.getElementById('openPanel').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  } catch (e) {
    console.error(e);
  }
});
