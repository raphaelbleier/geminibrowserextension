const OVERLAY_PREFS_KEY = "overlayPrefs";
let overlayRoot = null;
let lastImageData = null;
let isDraggingOverlay = false;
let dragOffset = { x: 0, y: 0 };
let isResizingOverlay = false;
let isOverlayVisible = false;
let isPointerInsidePanel = false;
let isSelecting = false;

if (window.gemini?.onMessage) {
  window.gemini.onMessage((message) => {
    if (message?.type === "OPEN_OVERLAY") {
      openOverlay();
    }
  });
}

function updateMouseIgnore() {
  if (!window.gemini?.setIgnoreMouseEvents) return;
  if (!overlayRoot || !isOverlayVisible) {
    window.gemini.setIgnoreMouseEvents(true);
    return;
  }
  if (isSelecting) {
    window.gemini.setIgnoreMouseEvents(false);
    return;
  }
  window.gemini.setIgnoreMouseEvents(!isPointerInsidePanel);
}

function openOverlay() {
  if (!overlayRoot) {
    createOverlay();
  }
  overlayRoot.style.display = "block";
  isOverlayVisible = true;
  loadHistory();
  updateMouseIgnore();
}

function createOverlay() {
  overlayRoot = document.createElement("div");
  overlayRoot.className = "gemini-overlay-root";
  overlayRoot.style.display = "none";

  const panel = document.createElement("div");
  panel.className = "gemini-overlay-panel";

  const header = document.createElement("div");
  header.className = "gemini-overlay-header";
  header.textContent = "Gemini Q&A";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    overlayRoot.style.display = "none";
    isOverlayVisible = false;
    updateMouseIgnore();
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

  const hideBtn = document.createElement("button");
  hideBtn.textContent = "Hide Overlay";
  hideBtn.className = "secondary";
  hideBtn.addEventListener("click", () => {
    overlayRoot.style.display = "none";
    isOverlayVisible = false;
    updateMouseIgnore();
  });

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
    window.gemini?.sendMessage({ type: "OPEN_OPTIONS" });
  });

  actions.append(captureBtn, hideBtn, askBtn, copyBtn, settingsBtn);

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

  overlayRoot._elements = { warning, prompt, answer, history, askBtn, panel };

  window.addEventListener("mousemove", (event) => {
    if (!overlayRoot || !isOverlayVisible) return;
    const rect = panel.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (inside !== isPointerInsidePanel) {
      isPointerInsidePanel = inside;
      updateMouseIgnore();
    }
  });
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
  await window.gemini?.sendMessage({
    type: "SET_OVERLAY_PREFS",
    prefs: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }
  });
}

async function restoreOverlayPrefs() {
  const result = await window.gemini?.sendMessage({ type: "GET_OVERLAY_PREFS" });
  const prefs = result?.prefs;
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
  answer.innerHTML = renderMarkdown(text || "");
}

async function submitRequest() {
  const { prompt, askBtn } = overlayRoot._elements;
  askBtn.disabled = true;
  showWarning("");
  setAnswer("Thinking...");

  const response = await window.gemini?.sendMessage({
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

function renderMarkdown(input) {
  const escaped = escapeHtml(input);
  const lines = escaped.split(/\r?\n/);
  let html = "";
  let inList = false;

  const flushList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  lines.forEach((line) => {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      const item = line.replace(/^\s*[-*]\s+/, "");
      html += `<li>${applyInlineMarkdown(item)}</li>`;
      return;
    }

    flushList();

    if (!line.trim()) {
      html += "<br />";
      return;
    }

    html += `<p>${applyInlineMarkdown(line)}</p>`;
  });

  flushList();
  return html;
}

function applyInlineMarkdown(text) {
  let output = text;
  output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*(.+?)\*/g, "<em>$1</em>");
  output = output.replace(/`(.+?)`/g, "<code>$1</code>");
  output = output.replace(/\$([^$]+)\$/g, "<span class=\"gemini-math\">$1</span>");
  return output;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadHistory() {
  const response = await window.gemini?.sendMessage({ type: "GET_HISTORY" });
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
  isSelecting = true;
  updateMouseIgnore();

  const overlay = document.createElement("div");
  overlay.className = "gemini-select-overlay";
  const rectEl = document.createElement("div");
  rectEl.className = "gemini-select-rect";
  document.body.appendChild(overlay);
  document.body.appendChild(rectEl);

  let startX = 0;
  let startY = 0;
  let isSelectingRect = false;

  function cleanup() {
    overlay.remove();
    rectEl.remove();
    overlay.removeEventListener("pointerdown", onPointerDown);
    overlay.removeEventListener("pointermove", onPointerMove);
    overlay.removeEventListener("pointerup", onPointerUp);
    overlay.removeEventListener("pointercancel", onPointerCancel);
    isSelecting = false;
    updateMouseIgnore();
  }

  function onPointerDown(event) {
    overlay.setPointerCapture(event.pointerId);
    isSelectingRect = true;
    startX = event.clientX;
    startY = event.clientY;
    rectEl.style.left = `${startX}px`;
    rectEl.style.top = `${startY}px`;
    rectEl.style.width = "0px";
    rectEl.style.height = "0px";
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!isSelectingRect) return;
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
    event.preventDefault();
  }

  async function onPointerUp(event) {
    if (!isSelectingRect) return;
    isSelectingRect = false;
    const endX = event.clientX;
    const endY = event.clientY;
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    cleanup();

    if (width < 8 || height < 8) {
      showWarning("Selection too small.");
      return;
    }

    let previousVisibility = null;
    if (overlayRoot) {
      previousVisibility = overlayRoot.style.visibility;
      overlayRoot.style.visibility = "hidden";
    }

    let dataUrl = null;
    try {
      dataUrl = await window.gemini?.captureScreen();
    } catch (error) {
      if (overlayRoot) {
        overlayRoot.style.visibility = previousVisibility || "visible";
      }
      showWarning(error?.message || "Capture failed.");
      return;
    }

    if (overlayRoot) {
      overlayRoot.style.visibility = previousVisibility || "visible";
    }

    if (!dataUrl) {
      showWarning("Capture failed.");
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const imageData = await cropImage(dataUrl, {
      left: left * dpr,
      top: top * dpr,
      width: width * dpr,
      height: height * dpr
    });

    lastImageData = imageData;
    showWarning("Screenshot captured.");
  }

  function onPointerCancel() {
    if (!isSelectingRect) return;
    isSelectingRect = false;
    cleanup();
  }

  overlay.addEventListener("pointerdown", onPointerDown);
  overlay.addEventListener("pointermove", onPointerMove);
  overlay.addEventListener("pointerup", onPointerUp);
  overlay.addEventListener("pointercancel", onPointerCancel);
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

updateMouseIgnore();
