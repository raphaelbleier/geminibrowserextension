const { contextBridge, ipcRenderer, desktopCapturer, screen } = require("electron");

async function captureScreen() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const scaleFactor = display.scaleFactor || 1;

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(width * scaleFactor),
      height: Math.round(height * scaleFactor)
    }
  });

  const source =
    sources.find((item) => item.display_id === display.id.toString()) || sources[0];
  if (!source) {
    throw new Error("No screen source available.");
  }

  return source.thumbnail.toDataURL();
}

contextBridge.exposeInMainWorld("gemini", {
  sendMessage: (message) => ipcRenderer.invoke("runtime:sendMessage", message),
  onMessage: (handler) => {
    ipcRenderer.on("runtime:message", (_event, message) => handler(message));
  },
  setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke("window:setIgnoreMouseEvents", ignore),
  captureScreen
});
