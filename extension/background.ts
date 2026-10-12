chrome.action.onClicked.addListener(tab => {
  if (!Number.isInteger(tab.id)) return;
  void (async () => {
    let error = '';
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); }
    catch { error = 'This page cannot be accessed. Open an ordinary web page and invoke the extension there.'; }
    await chrome.windows.create({ url: `${chrome.runtime.getURL('panel.html')}?tab=${tab.id}${error ? `&error=${encodeURIComponent(error)}` : ''}`,
      type: 'popup', width: 560, height: 760 });
  })();
});
