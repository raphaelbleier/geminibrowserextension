const SETTINGS_KEY = "settings";
const DEFAULT_SYSTEM_PROMPT = `You are an assistant that answers questions based on the provided image and user prompt.
If the question is multiple-choice, return ONLY the correct option letter(s) and the exact option text.
If multiple answers are correct, list all correct options.
If the question is open-ended, return a concise, clear answer in plain text.
Do not include explanations unless explicitly asked.`;

const apiKeyInput = document.getElementById("apiKey");
const modelSelect = document.getElementById("model");
const systemPromptInput = document.getElementById("systemPrompt");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");

const apiKeyError = document.getElementById("apiKeyError");
const modelError = document.getElementById("modelError");
const systemPromptError = document.getElementById("systemPromptError");

async function loadSettings() {
  const result = await window.gemini?.sendMessage({ type: "GET_SETTINGS" });
  const settings = result?.settings || {};
  apiKeyInput.value = settings.apiKey || "";
  modelSelect.value = settings.model || "gemini-3-pro-preview";
  systemPromptInput.value = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
}

function validate() {
  let valid = true;

  apiKeyError.style.display = apiKeyInput.value.trim() ? "none" : "block";
  systemPromptError.style.display = systemPromptInput.value.trim() ? "none" : "block";
  modelError.style.display = modelSelect.value ? "none" : "block";

  if (!apiKeyInput.value.trim()) valid = false;
  if (!systemPromptInput.value.trim()) valid = false;
  if (!modelSelect.value) valid = false;

  return valid;
}

async function saveSettings() {
  if (!validate()) {
    statusEl.textContent = "Please fill all required fields.";
    return;
  }

  await window.gemini?.sendMessage({
    type: "SET_SETTINGS",
    settings: {
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      systemPrompt: systemPromptInput.value.trim()
    }
  });

  statusEl.textContent = "Saved.";
}

resetBtn.addEventListener("click", () => {
  systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
  modelSelect.value = "gemini-3-pro-preview";
  statusEl.textContent = "Defaults restored (remember to save).";
});

saveBtn.addEventListener("click", saveSettings);
apiKeyInput.addEventListener("input", validate);
modelSelect.addEventListener("change", validate);
systemPromptInput.addEventListener("input", validate);

loadSettings();
