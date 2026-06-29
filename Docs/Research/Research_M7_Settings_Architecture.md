# Research M7 — Settings Architecture & Dual Mode Design Decisions

**Date:** 2026-06-28
**Related Milestone:** [Milestone 7 — Settings Page + Dual Mode + Model Asset Management](../Milestones/Milestone_7_Settings_Dual_Mode.md)
**Author:** Anirudh Jain

---

## Motivation

M7 required three architectural decisions that affected the entire app's UX and code structure:
1. How should the user trigger "polish" mode vs raw transcription?
2. Where should the settings live — embedded in the overlay or in a dedicated window?
3. Where should the Gemini API key be stored?

Each decision had implications for code complexity, user experience, and future maintainability.

---

## Decision 1: Polish Trigger — Overlay Toggle Button

### Options Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Overlay toggle button** | Always visible, clear visual state (purple ✦ icon), persists across sessions, no extra hotkey complexity | Takes ~30px of overlay width |
| Hold Shift during 2nd Alt+Space | Natural modifier-key-on-release analogy | Electron's `globalShortcut` only fires on key-down, not key-release — can't detect Shift at the moment Alt+Space is pressed for the *second* time |
| Separate hotkey (Alt+Shift+Space) | Distinct mental model: "record raw" vs "record and polish" | Two global shortcuts to manage, two hotkey registration calls, macOS permission issues compound |

### Decision: Overlay Toggle Button

A small button (✦ symbol, purple when active) sits between the waveform and the label in the floating overlay. Clicking it toggles between raw mode (gray) and polish mode (purple with background glow).

**Rationale:**
- Electron's `globalShortcut` API fundamentally doesn't support key-release events — the modifier-key approach would require polling the OS key state, which is fragile and platform-specific
- The toggle button gives instant visual feedback — users can see at a glance whether polish is on or off
- It persists between recording sessions — set it once, forget it
- No additional macOS permission complexity (already have Accessibility for the main hotkey)

**Trade-off:** The overlay is now 340px wide instead of the original 320px, to accommodate the toggle alongside the waveform and label. This is imperceptible in practice.

---

## Decision 2: Settings — Dedicated Window

### Options Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Dedicated settings window** | Ample room for radio buttons, text inputs, progress bars, and about section; accessible via dock icon; follows macOS settings app conventions | Additional BrowserWindow to manage; preload script; IPC channels |
| Overlay-embedded settings | No extra window; settings always one click away | The overlay is 340x100px — trying to fit radio buttons, API key input, model download buttons, and progress bars into that space would ruin the minimal aesthetic; overlay is floating and transparent — form controls would look out of place |

### Decision: Dedicated Settings Window

A 500x420px `BrowserWindow` with `titleBarStyle: "hiddenInset"` (macOS native look). Loaded from `settings.html` with its own preload script (`settings-preload.cjs`).

**Lifecycle:**
- Created on app startup (hidden)
- Shown on first run when `setupComplete: false`
- Shown on dock icon click (`app.on("activate")`)
- Hidden on close (not destroyed — `e.preventDefault()` + `settingsWindow.hide()`)
- Only destroyed on `app.on("before-quit")`

**Rationale:**
- Settings are a setup-time action, not a frequent interaction — burying them in the overlay doesn't save any actual clicks
- The dedicated window gives room for model download progress bars, API key input, and future settings (model selection, language preferences)
- Following macOS conventions (dock icon → settings window) makes the app feel native

**Trade-off:** Extra BrowserWindow means another renderer process and another preload script to maintain. At 500x420px with no heavy content, the memory overhead is negligible (<10MB).

---

## Decision 3: API Key Storage — JSON Config File

### Options Considered

| Approach | Pros | Cons |
|----------|------|------|
| **JSON config file in Application Support** | Zero native dependencies; trivially readable by the app; all preferences + key in one place | Not encrypted at rest; readable by any process with the user's permissions |
| macOS Keychain via keytar | Encrypted at rest; OS-managed; survives app reinstalls | Requires `keytar` npm package — a native module that needs `node-gyp` compilation for Electron's embedded Node; fragile across macOS/Electron/Node version upgrades; separates API key from other config (two read paths) |
| Electron `safeStorage` API | Built into Electron; encrypts using OS keychain under the hood; no native deps | Only available in Electron 30+; requires separate storage for non-secret config; API is async-only which complicates the simple config read/write pattern |

### Decision: JSON Config File

The Gemini API key is stored as `geminiApiKey` in `~/Library/Application Support/EcoVoice/config.json`, alongside other preferences.

**Rationale:**
- This is a **local-only, single-user desktop app** with no network servers, no multi-user access, and no remote data — the config file is protected by macOS filesystem permissions already
- `keytar` adds native build fragility (same class of problem as whisper.cpp in M5) for marginal security gain on a single-user machine
- If someone has access to read `~/Library/Application Support/EcoVoice/`, they already have access to the user's entire home directory — the API key is not the most sensitive thing there
- Simplicity: one file, one read path, one write path. No async Keychain dance on every config read

**Trade-off:** The key is plain text on disk. For a future multi-user or network-connected version, this should be upgraded to `safeStorage` or Keychain. Flagged as a revisit item.

### API Key Security Posture

The Gemini API key only needs **Chat Completions** permission (not List Models, not Model Capabilities). Users should:
1. Create a Gemini API key with only the Generative Language API enabled
2. Optionally set usage quotas to prevent unexpected charges
3. The free tier (60 requests/minute) is enough for individual dictation use

The app never logs the API key — it's only used to construct the OpenAI client, which is a runtime-only, in-memory operation.

---

## Decision 4: Model Download — Resumable vs Fresh Each Time

### Options Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Resumable with Range header** | Survives connection drops; UX for 1.2GB download doesn't reset; standard HTTP feature | More code — partial file detection, Range header construction, append-mode write stream |
| Full re-download on failure | Simpler code; no partial file state to manage | 1.2GB download that fails at 90% starts over from 0 — terrible UX on flaky connections |

### Decision: Resumable Downloads

The `model-downloader.js` module:
1. Checks if a partial file exists (`getPartialBytes()`)
2. Sends `Range: bytes=X-` header if resuming
3. Opens write stream in append mode (`flags: "a"`)
4. Verifies final file size is ≥95% of expected

**Rationale:** The Qwen model is 1.2GB. In many regions of the world, downloading 1.2GB in one shot is a multi-hour process with near-certain interruptions. Without resume, users on unreliable connections would effectively never download the model. The implementation is ~40 lines of straightforward HTTP code — the complexity is justified.

**Edge case:** If the HuggingFace CDN doesn't support Range requests (returns 200 instead of 206), the download starts fresh. The code handles this gracefully — it opens in `"w"` mode instead of `"a"` mode.

---

## Decision 5: Grammar Engine Lifecycle

### Options Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Load at startup, keep loaded** | Instant polish response (no model load delay); warm GPU memory; simple lifecycle | ~500ms added to startup time; GPU memory consumed even when not recording |
| Lazy-load on first polish request | Faster startup; GPU memory freed when idle | First polish request adds ~1.5s (model load + inference); feels slow; complex lifecycle management |

### Decision: Load at Startup

The grammar engine is created in `app.whenReady()` and kept loaded for the app's lifetime.

**Rationale:**
- The user already waited for the app to start — adding 500ms to startup (model load) is less noticeable than adding 1.5s to the first dictation (unexpected delay)
- Model offloading to free GPU memory is a valid optimization but belongs in M8 (Performance Hardening), not M7
- Keeping the model loaded matches the whisper model pattern — both are loaded once, used many times

## Issues Found During Implementation

1. **`whisper-node` runs fine in Electron without special handling.** The whisper.cpp binary compiled via `make` in M5 already works with Electron's embedded Node — no `@electron/rebuild` needed for whisper. This was a pleasant surprise; node-llama-cpp may differ.

2. **Overlay width increased from 320px to 340px.** The polish toggle button needs ~30px of space. The 20px increase is imperceptible in practice — the overlay is centered and small relative to the screen.

3. **Settings window close behavior is counterintuitive for Electron.** By default, Electron quits when all windows close. We override this with `settingsWindow.on("close", (e) => e.preventDefault() + settingsWindow.hide())` and `app.on("window-all-closed", () => {})` — both required for the macOS "background app" pattern.

4. **Grammar engine error recovery is multi-layered.** The polish() call is wrapped in try/catch in `main.js`, the grammar engine factory functions return stub engines when models/keys are missing, and the transcribe handler falls back to raw text on any failure. This triple safety net means text injection never fails due to grammar engine issues.

## Lessons Learned

- **Overlay toggle is more intuitive than modifier keys for Electron apps.** The constraint of key-down-only events makes modifier-based mode switching unnecessarily complex. A simple button with a clear icon does the job better and teaches users the feature exists.
- **Dedicated settings windows follow platform conventions.** macOS apps (System Settings, Safari, Mail) all use dedicated preference windows. Following the convention makes the app feel native, even if it's Electron under the hood.
- **config.json is good enough for local-only apps.** The security trade-off of plain-text API key storage is acceptable when the threat model is limited to a single-user local machine. Keychain/credential store integration can be added later if needed without changing the config interface.
- **API key validation should happen at use time, not save time.** The settings page saves whatever the user types — it doesn't validate the key against the Gemini API. Validation happens when the first polish request fires. This avoids adding network dependency to the settings page and gives better error messages ("Gemini API error: invalid key" with context) rather than "Invalid key" at save time.
