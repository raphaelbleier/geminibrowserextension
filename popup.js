document.getElementById("openOverlay").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "OPEN_OVERLAY" });
  window.close();
});

document.getElementById("openSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
