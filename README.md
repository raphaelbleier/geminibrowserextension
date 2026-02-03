# Gemini Screenshot Q&A (Chrome Extension)

A Chrome MV3 extension that lets you drag-select a screenshot, add a text prompt, and send both to Gemini 3. Answers appear in a movable/resizable in-page overlay with copy and unlimited history.

## Specs
- **Chrome only** (Manifest V3).
- **Input**: drag-select screenshot + optional text prompt.
- **Output**: in-page overlay with answer, copy button, and unlimited history.
- **Overlay**: movable + resizable, remembers last position/size globally.
- **Settings (required)**: API key, model, system prompt.
- **Models**: `gemini-3-pro-preview`, `gemini-3-flash-preview`.
- **Storage**: `chrome.storage.local` for settings, overlay prefs, and history.

## How It Works
1. Open the overlay.
2. Drag-select the area to capture (screenshot is cropped on-device).
3. Add a prompt (optional but recommended).
4. Submit to Gemini 3; the answer appears in the overlay.
5. Copy the answer or select prior items from history.

## Setup
1. **Get an API key** for Gemini.
2. **Load the extension**:
   - Open `chrome://extensions`.
   - Enable **Developer mode**.
   - Click **Load unpacked** and select this folder.
3. **Open Settings** from the extension popup.
4. **Fill required fields**:
   - API key
   - Model (default `gemini-3-pro-preview`)
   - System prompt (pre-filled; required)

## Usage
- Click the extension icon → **Open Overlay**.
- Click **Select Area** and drag to select a screenshot area.
- Add your prompt, then click **Ask Gemini**.
- Use **Copy Answer** to copy the response.
- Click a history item to re-open its answer.

## Default System Prompt
The default system prompt is pre-filled and required. It enforces:
- concise text answers
- multiple-choice output as correct option letter(s) and text only
- no explanations unless asked

## Files
- `manifest.json` — MV3 configuration
- `background.js` — service worker (Gemini calls, history)
- `content.js` / `content.css` — overlay UI + capture logic
- `options.html` / `options.js` — settings UI
- `popup.html` / `popup.js` — quick access

## Notes
- If any required setting is missing, requests are blocked.
- The overlay position/size is stored globally and restored on each page.

## License
Add your preferred license.
