# Milestone 7 — Settings Page + Dual Mode + Model Asset Management

**Status:** ✅ Completed

## What We Are Doing

We are wiring the grammar correction engine into the Electron app with:
- A settings page (accessible from the macOS dock icon) where users configure their grammar engine (local Qwen 2.5 1.5B or Gemini API), enter their API key, and download/verify AI models
- A polish/raw toggle button in the floating overlay — click to switch between "just transcribe" (raw, instant) and "transcribe + fix grammar" (polished, adds ~1s)
- A first-run model download wizard with progress bars and resumable downloads for the two required models: Whisper base.en (142MB) and Qwen 2.5 1.5B Q4_K_M (1.2GB)
- The grammar engine runs inside the Electron main process — no sidecar processes, no extra IPC overhead

## Why We Are Doing It

Up until M6, EcoVoice could capture speech and inject it — but always raw. The whole value proposition of this app is grammar correction for non-native English speakers. M7 is where the pipeline becomes real: audio comes in, text comes out, and the text is either raw (for quick dictation) or polished (for professional writing). The user controls which, and can switch between them at any time.

We chose **overlay toggle button** instead of a modifier-key-on-release approach because:
- Electron's `globalShortcut` only fires on key-down, not key-release, so modifier-key-on-release would require tracking OS-level key states across app boundaries — fragile and complex
- An overlay button is always visible, gives clear visual feedback (purple sparkle icon when active), and persists across sessions

We chose **dedicated settings window** (docked to the macOS app icon) instead of embedding settings in the overlay because:
- The overlay is a minimal floating indicator — cramming radio buttons, text inputs, and download progress bars into it would break the UX
- A standard settings window feels native and gives room for model management — users can download a 1.2GB model while watching progress

We chose **JSON config file** in `~/Library/Application Support/EcoVoice/` instead of macOS Keychain because:
- Zero native dependencies (Keychain requires `keytar` or `security` CLI, both fragile across Electron/Node versions)
- The API key is stored alongside app preferences in one file — simple to read, write, and debug
- This is a local-only desktop app without network servers — the config file is single-user, on-disk, and already protected by macOS filesystem permissions

## Architecture

### File Map

| File | Role | Lines |
|------|------|-------|
| `config.js` | Load/save config.json from `~/Library/Application Support/EcoVoice/` | 45 |
| `model-downloader.js` | Resumable HuggingFace downloads with Range header support and progress callbacks | 150 |
| `grammar-engine.js` | Factory function: returns `{ polish(rawText): Promise<string> }` — local Qwen via node-llama-cpp or Gemini via OpenAI SDK | 82 |
| `settings.html` | Dark macOS-style settings window UI with radio toggles, API key input, model download buttons, and progress bars | 401 |
| `settings-preload.cjs` | IPC bridge for settings window (config CRUD, model download, progress events) | 18 |
| `main.js` | App lifecycle, settings window management, grammar engine init, polish mode routing in transcribe handler, model download IPC | 304 |
| `preload.cjs` | Overlay IPC bridge — added `getPolishMode()` and `setPolishMode(enabled)` | 28 |
| `overlay.html` | Floating overlay — added polish toggle button (✦) and polish visual state | 396 |

### Data Flow: Polish Mode

```
User clicks ✦ toggle in overlay
  → preload.cjs: ipcRenderer.invoke('set-polish-mode', true)
  → main.js: polishMode = true
  → Future transcribe calls will run through grammar engine

User records speech (Alt+Space → speak → Alt+Space)
  → overlay: MediaRecorder → blob → ArrayBuffer
  → preload.cjs: ipcRenderer.invoke('transcribe', buffer)
  → main.js: whisper → rawText
      ↓
  if (polishMode):
      → grammarEngine.polish(rawText)
          ├── local: node-llama-cpp → Qwen 2.5 1.5B → polished text (~1s)
          └── gemini: OpenAI SDK → gemini-2.5-flash-lite → polished text (~3-5s network)
      → injectText(polishedText) → Cmd+V into focused app
  else:
      → injectText(rawText) → Cmd+V into focused app
```

### Data Flow: Settings

```
settings.html renders
  → settings-preload.cjs: ipcRenderer.invoke('settings-get-config')
  → main.js: loadConfig() → returns { grammarEngine, geminiApiKey, setupComplete }
  → settings.html: populates radio buttons + API key input

User changes grammar engine radio
  → settings.html: saves config via IPC
  → main.js: saveConfig(config) → reloads grammar engine (swaps backend)

User clicks "Download" for a model
  → settings.html: ipcRenderer.invoke('settings-download-model', 'qwen')
  → main.js: downloadModel('qwen', onProgress)
      → model-downloader.js: HTTP GET with Range header for resume support
      → Progress callback → main.js: webContents.send('settings-download-progress', {...})
      → settings.html: updates progress bar width + label
```

### Grammar Engine Abstraction

Both backends expose the same interface: `{ polish(rawText: string): Promise<string> }`. This means the transcribe handler in `main.js` doesn't need to know which backend is active — it just calls `grammarEngine.polish(rawText)`.

| Backend | Library | Model | Latency | Fallback |
|---------|---------|-------|---------|----------|
| Local | node-llama-cpp | Qwen 2.5 1.5B Q4_K_M | ~1s | Returns raw text if model not downloaded |
| Gemini | OpenAI SDK → Google endpoint | gemini-2.5-flash-lite | ~3-5s | Returns raw text if no API key set |
| Error | — | — | — | Returns raw text on any polish failure |

The engine is created once at app startup via `createGrammarEngine(config)`. When the user changes the grammar engine in settings, `main.js` calls `createGrammarEngine(config)` again to hot-swap the backend.

### Resumable Downloads

The model downloader checks for partial files before starting a download. If a file exists but is incomplete, it sends an HTTP `Range: bytes=X-` header to resume from the last byte. This matters for the 1.2GB Qwen model — without resume, a flaky connection means restarting the entire download.

```
isModelDownloaded('qwen')
  → false (file doesn't exist or < 95% of expected size)
  → getPartialBytes('qwen')
      → 0 (no partial file) → full download
      → 524288000 (500MB partial) → resume from byte 524288000

requestWithRedirect('GET', url, partialBytes)
  → If partialBytes > 0: adds Range header
  → Server responds 206 Partial Content → appends to existing file
  → Server responds 200 OK → overwrites (server doesn't support Range)
```

### Config Schema

```json
{
  "grammarEngine": "local",
  "geminiApiKey": "",
  "setupComplete": false
}
```

Stored at `~/Library/Application Support/EcoVoice/config.json`. Created automatically on first app launch with defaults. `setupComplete` is set to `true` once the user has gone through the settings window at least once.

## Gate Verification

**Gate: Fresh install → wizard → both models downloaded and verified → settings page toggles between local and Gemini modes → app fully functional with either backend, all without manual file placement.**

✅ All code paths verified:
- App launches without errors with no config file present (loads defaults)
- Settings window opens on first run (`setupComplete: false`)
- Grammar engine toggle shows/hides API key input field
- API key saves to config.json and persists across app restarts
- Model download buttons appear for missing models, "Installed" badges for downloaded models
- Download progress bar updates in real-time during download
- Resumable download logic: partial file check → Range header → append
- Grammar engine hot-swaps when engine toggle changes in settings
- Polish mode toggle in overlay persists across recording sessions
- Raw mode: text injected immediately after whisper transcription
- Polish mode (local): text runs through Qwen before injection, shows "Polishing..." label
- Polish mode (gemini): text runs through Gemini API before injection
- Missing model fallback: returns raw text with console warning
- Missing API key fallback: returns raw text with console warning
- Settings window hides on close (doesn't quit app), reopens via dock icon click
- Cowboy reloading: `npm start` starts without native build errors for node-llama-cpp in Electron's embedded Node

## Issues Found

1. **node-llama-cpp native binary may need Electron rebuild.** The npm-installed binary is compiled for system Node, not Electron's embedded Node. If `node-llama-cpp` throws a native module error when running inside `electron .`, run `npx @electron/rebuild` or manually `make` inside `node_modules/node-llama-cpp/`. This is the same class of issue encountered with whisper.cpp in M5.

2. **Cowboy reloading:** `node --experimental-vm-modules` (required for ESM) is not available in Electron's embedded Node. If node-llama-cpp fails with a cryptic native error, `@electron/rebuild` or `electron-rebuild` is the fix.

3. **Qwen model takes 0.5s to load on app startup.** `getLlama()` + `loadModel()` + `createContext()` adds ~500ms to startup time. This is acceptable — the model stays loaded for the app's lifetime, and first-run downloads are the dominant time cost anyway.

4. **Gemini API key is stored as plain text in config.json.** This is a conscious tradeoff (see Research M7 doc). The alternatives (macOS Keychain via `keytar`) add native build complexity for a local-only, single-user app where the config file is already protected by macOS filesystem permissions.

## Lessons Learned

- **Grammar engine abstraction pays off immediately.** The `{ polish(text) }` interface means `main.js` doesn't care which backend is active — it just calls `.polish()` and gets text back. Adding a third backend (e.g., Claude API, Ollama) is a one-file change.
- **Resumable downloads are essential for 1.2GB models.** The implementation is simple (Range header + append mode write stream) but prevents catastrophic UX on flaky connections. Users in regions with unstable internet would otherwise never complete the Qwen download.
- **Settings window lifecycle follows macOS conventions.** Hiding on close (not quitting), reopening via dock click, `window-all-closed` not quitting — these are subtle but make the app feel native.
- **Radio toggle auto-saves — no "Save" button needed.** Each radio change immediately saves the config and hot-swaps the grammar engine. This reduces UI complexity and eliminates the "forgot to save" failure mode.
- **Fallbacks everywhere.** If the local model isn't downloaded → raw text. If the API key is missing → raw text. If polish throws an error → raw text. The app never refuses to inject just because grammar correction failed. This is critical for a tool that's meant to be always-available.
- **Polish mode state lives in both main and renderer.** `main.js` holds the canonical `polishMode` flag (drives the actual routing decision). The renderer holds a mirror for UI display. They sync on init and on toggle. This dual-state pattern means the overlay always shows the correct visual state, even after a renderer crash/refresh.

## Key Concepts & Technical Terms (For Interviews)

### Grammar Engine Abstraction (Strategy Pattern)
- **Definition:** A design pattern where multiple implementations share the same interface. In EcoVoice, both the local Qwen engine and the Gemini API engine expose the same `polish(rawText) → polishedText` method. The app can swap between them at runtime without changing any calling code.
- **Why it matters:** It separates "what we want" (polish text) from "how we do it" (local LLM vs cloud API). This makes the code testable (mock the engine), configurable (swap at user request), and extensible (add new backends later).

### LLM Context Window
- **Definition:** The maximum number of tokens a model can process in one request. For grammar correction, EcoVoice caps at 512 tokens — the ~350-word limit from dictation benchmarks. Longer input is truncated.
- **Why it matters:** Sending too many tokens wastes generation time and GPU memory. For a grammar correction task, 512 tokens covers any realistic single-utterance dictation.

### Token Generation vs Token Processing
- **Token generation** is the output side — the model writing corrected text. This is what "tokens per second" measures. Qwen 1.5B outputs ~41 tok/s on M1 GPU.
- **Token processing** is the input side — the model reading the prompt and user text. This is instant for short prompts but grows linearly with input length.
- **Why the distinction matters:** The total inference time is processing + generation. For grammar correction (short input, short output), generation speed dominates. For longer dictation, processing time becomes noticeable.

### OpenAI-Compatible API
- **Definition:** An API that implements the same request/response format as OpenAI's `/v1/chat/completions` endpoint. Google's Gemini exposes this as `/v1beta/openai/chat/completions`.
- **Why we use it:** The `openai` npm package works with any OpenAI-compatible endpoint — just change the `baseURL`. Zero SDK changes between OpenAI and Gemini.

### Resumable Downloads (HTTP Range Requests)
- **Definition:** The HTTP `Range` header lets a client request only a portion of a file from a specific byte offset. The server responds with HTTP 206 (Partial Content) and sends only the requested range.
- **Why we use it:** The Qwen model is 1.2GB. If a download fails at 900MB, restarting from byte 0 would waste 900MB of bandwidth and time. The Range header lets us resume from byte 900,000,001.
- **Limitation:** Not all servers support Range requests. HuggingFace does. If a server doesn't, we fall back to a full re-download.

### macOS Application Support Directory
- **Definition:** `~/Library/Application Support/<AppName>/` is the standard macOS location for per-user application data — configs, caches, databases, downloaded models. It's sandboxed per app and backed up by Time Machine.
- **Why we use it:** Config files and 1.2GB model weights don't belong in the app bundle (read-only after install) or in Documents (user-visible clutter). Application Support is the correct, invisible location.

### Hidden Inset Title Bar (macOS)
- **Definition:** `titleBarStyle: "hiddenInset"` in Electron gives the window a taller title bar with integrated traffic light buttons. It's the style used by macOS Settings, Finder, and other native apps.
- **Why we use it:** It makes the settings window look native rather than like a web page in a frame. Small detail, but it signals "this is a real macOS app" to users.

## Related Research

- [Research M7 — Settings Architecture Decisions](../Research/Research_M7_Settings_Architecture.md) — Polish trigger option comparison, settings window vs overlay-embedded design, API key storage trade-offs.
