const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const ffi = require("ffi-napi");
const ref = require("ref-napi");

const HISTORY_KEY = "history";
const SETTINGS_KEY = "settings";
const OVERLAY_PREFS_KEY = "overlayPrefs";

const DEFAULT_SYSTEM_PROMPT = `You are an assistant that answers questions based on the provided image and user prompt.
If the question is multiple-choice, return ONLY the correct option letter(s) and the exact option text.
If multiple answers are correct, list all correct options.
If the question is open-ended, return a concise, clear answer in plain text.
Do not include explanations unless explicitly asked.`;

const DATA_FILE = () => path.join(app.getPath("userData"), "data.json");

let mainWindow = null;
let settingsWindow = null;
let tray = null;

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeData(data) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(DATA_FILE(), JSON.stringify(data, null, 2), "utf-8");
}

async function getSettings() {
  const data = await readData();
  const current = data[SETTINGS_KEY] || {};
  return {
    apiKey: current.apiKey || "",
    model: current.model || "gemini-3-pro-preview",
    systemPrompt: current.systemPrompt || DEFAULT_SYSTEM_PROMPT
  };
}

async function setSettings(settings) {
  const data = await readData();
  data[SETTINGS_KEY] = settings;
  await writeData(data);
}

async function getHistory() {
  const data = await readData();
  return data[HISTORY_KEY] || [];
}

async function appendHistory(entry) {
  const data = await readData();
  const history = data[HISTORY_KEY] || [];
  history.unshift(entry);
  data[HISTORY_KEY] = history;
  await writeData(data);
}

async function getOverlayPrefs() {
  const data = await readData();
  return data[OVERLAY_PREFS_KEY] || null;
}

async function setOverlayPrefs(prefs) {
  const data = await readData();
  data[OVERLAY_PREFS_KEY] = prefs;
  await writeData(data);
}

function getMissingSettings(settings) {
  const missing = [];
  if (!settings?.apiKey) missing.push("apiKey");
  if (!settings?.model) missing.push("model");
  if (!settings?.systemPrompt) missing.push("systemPrompt");
  return missing;
}

function buildGeminiRequest({ model, systemPrompt, userPrompt, imageData }) {
  const parts = [];
  if (userPrompt) {
    parts.push({ text: userPrompt });
  }
  if (imageData) {
    parts.push({ inlineData: { mimeType: "image/png", data: imageData } });
  }

  return {
    model,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: "user",
        parts
      }
    ]
  };
}

function extractGeminiText(data) {
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n") || "";
  return text.trim() || "No response text returned.";
}

async function handleGeminiRequest(message) {
  const settings = await getSettings();
  const missing = getMissingSettings(settings);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing settings: ${missing.join(", ")}`,
      code: "MISSING_SETTINGS"
    };
  }

  const { apiKey, model, systemPrompt } = settings;
  const userPrompt = (message.prompt || "").trim();
  const imageData = message.imageData || null;

  if (!userPrompt && !imageData) {
    return { ok: false, error: "Please provide a prompt or a screenshot." };
  }

  const requestBody = buildGeminiRequest({
    model,
    systemPrompt,
    userPrompt,
    imageData
  });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: errorText || "Gemini API error." };
    }

    const data = await response.json();
    const answer = extractGeminiText(data);

    const entry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      model,
      prompt: userPrompt,
      answer,
      hasImage: Boolean(imageData)
    };

    await appendHistory(entry);

    return { ok: true, answer, entry };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, error: "Request timed out after 90 seconds." };
    }
    return { ok: false, error: error?.message || "Request failed." };
  }
}

function setWindowDisplayAffinity(win) {
  if (process.platform !== "win32") return;
  try {
    const user32 = ffi.Library("user32", {
      SetWindowDisplayAffinity: ["bool", ["pointer", "uint32"]]
    });
    const hwndBuffer = win.getNativeWindowHandle();
    const hwnd = ref.readPointer(hwndBuffer, 0, hwndBuffer.length);
    user32.SetWindowDisplayAffinity(hwnd, 0x00000011);
  } catch (error) {
    console.error("Failed to set display affinity:", error);
  }
}

function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    fullscreen: true,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.showInactive();
    mainWindow.setContentProtection(true);
    setWindowDisplayAffinity(mainWindow);
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 840,
    height: 720,
    show: false,
    backgroundColor: "#0f1115",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.once("ready-to-show", () => settingsWindow.show());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAASFBMVEUAAAD///////////////////////////////////////////////////////////////////8rY7bEAAAAHnRSTlMAAQIDBAYICQwQEhUXGCEjJy8xNjxKZ2scmAAABV0lEQVQY022Q2XaDIAxF0xJtQApq///pNPRNLRrKVa0sySdxvDTthm+FIidGDXRV8QYBk4cVVb1NqZ1x5bF1z9MCm9n6Z8C9B4n0dzL8AX1gmf0pI6CO5AlDFM5IVZ8hW4U1uhIH20r2w3QJQJpO5qzSP3oM1f4ZEdYFDRn2j0IOpZqM60gSt0EAvR4oXSBQ7xW8+1aYvRoxYp7h4G4cN5MsDk1FE1wVq7I3q2n9xr1bVqnJp4oZ8o/6RrW1Oqa1C1nA8j1k+qD5w5H0j8D6+eyXoaZ0lKZ9JJxglC4RjquvQ5x1yFptQAAAABJRU5ErkJggg=="
  );

  tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    {
      label: "Show Overlay",
      click: () => {
        if (mainWindow) {
          mainWindow.showInactive();
          mainWindow.webContents.send("runtime:message", { type: "OPEN_OVERLAY" });
        }
      }
    },
    {
      label: "Open Settings",
      click: () => createSettingsWindow()
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip("Gemini Overlay");
  tray.setContextMenu(menu);
}

function registerShortcuts() {
  globalShortcut.register("Alt+Shift+O", () => {
    if (mainWindow) {
      mainWindow.showInactive();
      mainWindow.webContents.send("runtime:message", { type: "OPEN_OVERLAY" });
    }
  });
}

ipcMain.handle("runtime:sendMessage", async (_event, message) => {
  if (!message || !message.type) return { ok: false, error: "Missing message type." };

  if (message.type === "GEMINI_REQUEST") {
    return handleGeminiRequest(message);
  }

  if (message.type === "GET_HISTORY") {
    const history = await getHistory();
    return { ok: true, history };
  }

  if (message.type === "GET_SETTINGS") {
    const settings = await getSettings();
    return { ok: true, settings };
  }

  if (message.type === "SET_SETTINGS") {
    await setSettings(message.settings || {});
    return { ok: true };
  }

  if (message.type === "GET_OVERLAY_PREFS") {
    const prefs = await getOverlayPrefs();
    return { ok: true, prefs };
  }

  if (message.type === "SET_OVERLAY_PREFS") {
    await setOverlayPrefs(message.prefs || null);
    return { ok: true };
  }

  if (message.type === "OPEN_OPTIONS") {
    createSettingsWindow();
    return { ok: true };
  }

  return { ok: false, error: "Unknown message type." };
});

ipcMain.handle("window:setIgnoreMouseEvents", (_event, ignore) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  registerShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
