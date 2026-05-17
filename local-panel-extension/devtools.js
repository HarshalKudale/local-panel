/**
 * Local Panel Companion — DevTools bootstrap page.
 * Registers the Local Panel tab in Chrome DevTools.
 */
chrome.devtools.panels.create(
    "Local Panel",
    "icons/icon16.png",
    "devtools-panel.html"
);
