const HISTORY_KEY = "history";
const SETTINGS_KEY = "settings";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(sender.tab?.windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, dataUrl });
    });
    return true;
  }

  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "GET_HISTORY") {
    chrome.storage.local.get([HISTORY_KEY], (result) => {
      sendResponse({ ok: true, history: result[HISTORY_KEY] || [] });
    });
    return true;
  }

  if (message.type === "GEMINI_REQUEST") {
    handleGeminiRequest(message).then(sendResponse);
    return true;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-overlay") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "OPEN_OVERLAY" });
});

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
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

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
    return { ok: false, error: error?.message || "Request failed." };
  }
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

function getMissingSettings(settings) {
  const missing = [];
  if (!settings?.apiKey) missing.push("apiKey");
  if (!settings?.model) missing.push("model");
  if (!settings?.systemPrompt) missing.push("systemPrompt");
  return missing;
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      resolve(result[SETTINGS_KEY] || {});
    });
  });
}

async function appendHistory(entry) {
  const current = await new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY], (result) => {
      resolve(result[HISTORY_KEY] || []);
    });
  });

  current.unshift(entry);
  await new Promise((resolve) => {
    chrome.storage.local.set({ [HISTORY_KEY]: current }, resolve);
  });
}
