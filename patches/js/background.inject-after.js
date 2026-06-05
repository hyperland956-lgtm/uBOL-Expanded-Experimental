// First-install welcome page — appended to background.js by the build pipeline.
// Opens welcome.html exactly once when the extension is first installed.
runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') { return; }
    browser.tabs.create({ url: runtime.getURL('welcome.html') });
});
