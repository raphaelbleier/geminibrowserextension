const OVERLAY_PREFS_KEY = "overlayPrefs";
let overlayRoot = null;
let lastImageData = null;
let isDraggingOverlay = false;
let dragOffset = { x: 0, y: 0 };
let isResizingOverlay = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_OVERLAY") {
    openOverlay();
  }
});

function openOverlay() {
  if (!overlayRoot) {
    createOverlay();
  }
  overlayRoot.style.display = "block";
  loadHistory();
}

function createOverlay() {
  overlayRoot = document.createElement("div");
  overlayRoot.className = "gemini-overlay-root";

  const panel = document.createElement("div");
  panel.className = "gemini-overlay-panel";

  const header = document.createElement("div");
  header.className = "gemini-overlay-header";
  header.textContent = "Gemini Q&A";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    overlayRoot.style.display = "none";
  });
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "gemini-overlay-body";

  const warning = document.createElement("div");
  warning.className = "gemini-overlay-warning";
  warning.style.display = "none";

  const prompt = document.createElement("textarea");
  prompt.className = "gemini-overlay-prompt";
  prompt.placeholder = "Describe the question or add context...";

  const actions = document.createElement("div");
  actions.className = "gemini-overlay-actions";

  const captureBtn = document.createElement("button");
  captureBtn.textContent = "Select Area";
  captureBtn.addEventListener("click", () => startSelection());

  const askBtn = document.createElement("button");
  askBtn.textContent = "Ask Gemini";
  askBtn.addEventListener("click", () => submitRequest());

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy Answer";
  copyBtn.className = "secondary";
  copyBtn.addEventListener("click", () => copyAnswer());

  const settingsBtn = document.createElement("button");
  settingsBtn.textContent = "Settings";
  settingsBtn.className = "secondary";
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  });

  actions.append(captureBtn, askBtn, copyBtn, settingsBtn);

  const answer = document.createElement("div");
  answer.className = "gemini-overlay-answer";
  answer.textContent = "No response yet.";

  const history = document.createElement("div");
  history.className = "gemini-overlay-history";

  body.append(warning, prompt, actions, answer, history);
  panel.append(header, body);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "gemini-resize-handle";
  panel.appendChild(resizeHandle);

  overlayRoot.appendChild(panel);
  document.body.appendChild(overlayRoot);

  initDrag(header);
  initResize(resizeHandle);
  restoreOverlayPrefs();

  overlayRoot._elements = { warning, prompt, answer, history, askBtn };
}

function initDrag(handle) {
  handle.addEventListener("mousedown", (event) => {
    if (!overlayRoot) return;
    isDraggingOverlay = true;
    dragOffset.x = event.clientX - overlayRoot.offsetLeft;
    dragOffset.y = event.clientY - overlayRoot.offsetTop;
  });

  window.addEventListener("mousemove", (event) => {
    if (!isDraggingOverlay || !overlayRoot) return;
    overlayRoot.style.left = `${event.clientX - dragOffset.x}px`;
    overlayRoot.style.top = `${event.clientY - dragOffset.y}px`;
  });

  window.addEventListener("mouseup", () => {
    if (isDraggingOverlay) {
      isDraggingOverlay = false;
      saveOverlayPrefs();
    }
  });
}

function initResize(handle) {
  handle.addEventListener("mousedown", (event) => {
    isResizingOverlay = true;
    event.stopPropagation();
  });

  window.addEventListener("mousemove", (event) => {
    if (!isResizingOverlay || !overlayRoot) return;
    const rect = overlayRoot.getBoundingClientRect();
    const width = Math.max(320, event.clientX - rect.left);
    const height = Math.max(360, event.clientY - rect.top);
    overlayRoot.style.width = `${width}px`;
    overlayRoot.style.height = `${height}px`;
  });

  window.addEventListener("mouseup", () => {
    if (isResizingOverlay) {
      isResizingOverlay = false;
      saveOverlayPrefs();
    }
  });
}

async function saveOverlayPrefs() {
  if (!overlayRoot) return;
  const rect = overlayRoot.getBoundingClientRect();
  await chrome.storage.local.set({
    [OVERLAY_PREFS_KEY]: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }
  });
}

async function restoreOverlayPrefs() {
  const result = await chrome.storage.local.get([OVERLAY_PREFS_KEY]);
  const prefs = result[OVERLAY_PREFS_KEY];
  if (!prefs || !overlayRoot) return;
  overlayRoot.style.left = `${prefs.left}px`;
  overlayRoot.style.top = `${prefs.top}px`;
  overlayRoot.style.width = `${prefs.width}px`;
  overlayRoot.style.height = `${prefs.height}px`;
}

function showWarning(text) {
  const { warning } = overlayRoot._elements;
  warning.textContent = text;
  warning.style.display = text ? "block" : "none";
}

function setAnswer(text) {
  const { answer } = overlayRoot._elements;
  answer.textContent = text || "";
}

async function submitRequest() {
  const { prompt, askBtn } = overlayRoot._elements;
  askBtn.disabled = true;
  showWarning("");
  setAnswer("Thinking...");

  const response = await chrome.runtime.sendMessage({
    type: "GEMINI_REQUEST",
    prompt: prompt.value,
    imageData: lastImageData
  });

  askBtn.disabled = false;

  if (!response?.ok) {
    setAnswer("Request failed.");
    showWarning(response?.error || "Unknown error.");
    return;
  }

  setAnswer(response.answer);
  await loadHistory();
}

async function copyAnswer() {
  const { answer } = overlayRoot._elements;
  try {
    await navigator.clipboard.writeText(answer.textContent || "");
    showWarning("Copied to clipboard.");
    setTimeout(() => showWarning(""), 1200);
  } catch {
    showWarning("Copy failed.");
  }
}

async function loadHistory() {
  const response = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
  const history = response?.history || [];
  const { history: historyContainer } = overlayRoot._elements;
  historyContainer.innerHTML = "";

  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No history yet.";
    historyContainer.appendChild(empty);
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "gemini-history-item";
    item.textContent = entry.answer.slice(0, 160) || "(no text)";
    const meta = document.createElement("small");
    meta.textContent = new Date(entry.ts).toLocaleString();
    item.appendChild(meta);
    item.addEventListener("click", () => {
      setAnswer(entry.answer);
    });
    historyContainer.appendChild(item);
  });
}

function startSelection() {
  const overlay = document.createElement("div");
  overlay.className = "gemini-select-overlay";
  const rectEl = document.createElement("div");
  rectEl.className = "gemini-select-rect";
  document.body.appendChild(overlay);
  document.body.appendChild(rectEl);

  let startX = 0;
  let startY = 0;

  function cleanup() {
    overlay.remove();
    rectEl.remove();
  }

  function onMouseDown(event) {
    startX = event.clientX;
    startY = event.clientY;
    rectEl.style.left = `${startX}px`;
    rectEl.style.top = `${startY}px`;
    rectEl.style.width = "0px";
    rectEl.style.height = "0px";
  }

  function onMouseMove(event) {
    const currentX = event.clientX;
    const currentY = event.clientY;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    rectEl.style.left = `${left}px`;
    rectEl.style.top = `${top}px`;
    rectEl.style.width = `${width}px`;
    rectEl.style.height = `${height}px`;
  }

  async function onMouseUp(event) {
    const endX = event.clientX;
    const endY = event.clientY;
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    cleanup();
    overlay.removeEventListener("mousedown", onMouseDown);
    overlay.removeEventListener("mousemove", onMouseMove);
    overlay.removeEventListener("mouseup", onMouseUp);

    if (width < 8 || height < 8) {
      showWarning("Selection too small.");
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" });
    if (!response?.ok) {
      showWarning(response?.error || "Capture failed.");
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const imageData = await cropImage(response.dataUrl, {
      left: left * dpr,
      top: top * dpr,
      width: width * dpr,
      height: height * dpr
    });

    lastImageData = imageData;
    showWarning("Screenshot captured.");
  }

  overlay.addEventListener("mousedown", onMouseDown, { once: true });
  overlay.addEventListener("mousemove", onMouseMove);
  overlay.addEventListener("mouseup", onMouseUp);
}

async function cropImage(dataUrl, rect) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    img,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height
  );
  const croppedDataUrl = canvas.toDataURL("image/png");
  return croppedDataUrl.split(",")[1];
}
