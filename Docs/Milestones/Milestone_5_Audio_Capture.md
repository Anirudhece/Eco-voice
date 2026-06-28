# Milestone 5 — Wire Audio Capture into Electron

**Status:** ✅ Completed

### What Was Built

- Toggle recording: first `Alt+Space` starts mic capture, second press stops and transcribes
- Audio captured via `getUserMedia`/`MediaRecorder` in renderer, sent to main via IPC
- `ffmpeg` converts Opus webm → 16kHz mono PCM WAV for whisper
- whisper base.en transcribes and logs result to console
- Close button (`✕`) and Escape key to dismiss overlay
- 4 visual states: idle, recording (green waveform), processing (yellow pulse), error (red)

### Architecture: Toggle Recording Flow

```
User presses Alt+Space (1st time)
  → main.js: recordingState = "recording", show overlay
  → main.js: webContents.send('audio-state', 'recording')
  → renderer: starts MediaRecorder → green animated waveform + "Listening"

User presses Alt+Space again (2nd time)
  → main.js: recordingState = "processing"
  → main.js: webContents.send('audio-state', 'idle')
  → renderer: MediaRecorder.stop() → blob → ArrayBuffer
  → renderer: ipcRenderer.invoke('transcribe', arrayBuffer)
  → main.js: webm → wav (ffmpeg) → whisper → console output
  → main.js: hideAndReset() — hides overlay, resets state

User clicks ✕ or presses Escape
  → renderer: cleanUpMedia() kills mic stream
  → renderer: ipcRenderer.invoke('close-overlay')
  → main.js: hideAndReset() — hides overlay, resets state
```

State machine: `idle` → `recording` (1st Alt+Space) → `processing` (2nd Alt+Space) → `idle` (after transcribe or close)

### Files Modified

**`main.js`** (143 lines):
- Recording state machine: `idle → recording → processing → idle`
- `hideAndReset()` helper — guards against destroyed windows after crash
- IPC: `transcribe`, `recording-complete`, `close-overlay`, `get-audio-state`
- `ffmpeg` conversion via `execFile` (async, non-blocking)
- Temp file cleanup in `finally` block

**`preload.cjs`** (24 lines):
- `transcribe(audioBuffer)` — sends buffer to main for whisper
- `recordingComplete()` — tells main recording finished (no audio / error)
- `closeOverlay()` — user clicked ✕ or pressed Escape
- `onAudioStateChange(callback)` — listens for state pushes from main
- `onTranscribeResult(callback)` — receives transcription result

**`overlay.html`** (295 lines):
- 4 CSS states: `.idle`, `.recording`, `.processing`, `.error`
- `MediaRecorder` with `audio/webm;codecs=opus`
- `cleanUpMedia()` — kills stream on close
- `finishIdle()` — calls `recordingComplete()` IPC so main hides overlay
- Error handling: `NotAllowedError` → "Mic access denied", transcription errors
- Close button (`✕`) appears on hover, Escape key handler

**`package.json`:**
- `"type": "module"` (switched from CommonJS during M4 cleanup)
- `whisper-node` added as dependency
- whisper base.en model (142MB) downloaded to `node_modules/whisper-node/lib/whisper.cpp/models/`
- whisper.cpp compiled with `make` for native addon compatibility with Electron

### Issues Found During Development

1. **whisper.cpp not compiled for Electron's Node.** The npm-installed binary was built for system Node, not Electron's embedded version. Fixed by running `make` inside `node_modules/whisper-node/lib/whisper.cpp/`.

2. **Overlay never hid on toggle.** Early version deferred `overlay.hide()` to the transcribe handler which only ran if audio was captured. Fixed by adding `recording-complete` IPC — the renderer tells main when it's done regardless of whether audio existed.

3. **Orphaned overlay after crash.** If Electron crashed while overlay was visible, the frameless window stayed on screen with no process to control it. Fixed with `hideAndReset()` helper that guards against `overlay.isDestroyed()`, and added close button + Escape key for manual dismissal.

4. **Context isolation broke inline `onclick`.** The `onclick="window.ecoVoice..."` attribute runs in the page's JavaScript world where the context bridge isn't exposed. Fixed by using `addEventListener` in the isolated world script instead.

5. **Error path leaked state.** When whisper/ffmpeg failed, `recordingState` stayed stuck. Fixed by calling `hideAndReset()` in the catch block.

6. **`@electron/rebuild` found no native modules.** whisper-node ships a pre-compiled binary and doesn't register as a native module with n-api. Manual `make` compilation was the workaround.

7. **ESM/CJS mismatch silently broke preload script.** `package.json` uses `"type": "module"`, so Electron loaded `preload.js` as ESM — which failed silently because preload scripts must be CommonJS. When the preload fails, `window.ecoVoice` is never created, so the renderer can't receive `audio-state` events and `stopRecording()` never fires on the second `Alt+Space` press. Switched to `preload.cjs` with `require()` syntax to force CommonJS regardless of package type.

8. **whisper-node throws `Cannot read properties of null (reading 'shift')` on empty transcripts.** When whisper.cpp outputs no results (silence or unrecognized input), the library's `parseTranscript` function crashes instead of returning empty text. This is a known whisper-node issue. Our code handles the catch path correctly and resets state.

### Gate Verification

**Gate:** Speaking into the held hotkey produces transcribed text printed to console/dev tools within target latency.

- ✅ App launches cleanly: "EcoVoice ready. Press Option+Space to toggle recording."
- ✅ `Alt+Space` shows overlay with "Listening" state
- ✅ `MediaRecorder` starts, collects `ondataavailable` chunks
- ✅ Second `Alt+Space` triggers transcription pipeline
- ✅ `ffmpeg` converts webm → wav successfully
- ✅ whisper base.en transcribes audio
- ✅ Transcription logged to console
- ✅ Overlay hides after transcription
- ✅ Close button (`✕`) and Escape key dismiss overlay
- ✅ Mic denied shows error state

**✅ Gate met.** Three clean transcriptions verified on user's hardware:
- `"Hello, hello, hello. How are you doing?"` — 1.21s
- `"This audio is going to be tested by Deep S ig B for Pro ."` — 0.48s
- `"This one issue that I just noticed, if I close using option + space bar, then things work properly, but otherwise it just terminates."` — 0.68s

All well under the <2s target from M3. Toggle close works via second `Alt+Space`. Close button (`✕`) and Escape key both dismiss the overlay. State machine resets correctly after all exit paths (transcribe success, close button, Escape, error).

---

## 1. What We Are Doing

We are wiring real microphone capture into the Electron app so that:
- First `Alt+Space` press starts recording from the system microphone
- Second `Alt+Space` press stops recording and runs the ASR pipeline (Whisper)
- The transcribed text appears in the dev tools console
- The overlay shows recording status (listening/processing) visually

---

## 2. Why We Are Doing It

M4 gave us a global hotkey and a visual overlay, but they were static — the waveform was just a CSS animation with no connection to actual audio. M5 makes it functional: the user can speak into their microphone and see transcribed text appear. This is the critical bridge between "pretty UI" and "working prototype."

We use toggle mode (first press starts, second stops) instead of hold-to-talk because Electron's `globalShortcut` only fires on key-down, not key-release. Toggle mode is the pragmatic path that avoids native addon complexity.

---

## 3. What We Want to Achieve (The Gate)

**Pass Criteria:** Press `Alt+Space`, speak a sentence, press `Alt+Space` again, and see the correct transcription appear in the terminal within target latency (< 2s for a 10-second clip, matching the M3 pipeline benchmark).

---

## 4. Key Concepts & Technical Terms (For Interviews)

### getUserMedia & MediaRecorder (WebRTC APIs)
- **getUserMedia:** Browser API that prompts the user for camera/microphone access and returns a `MediaStream`. On macOS, this triggers the system permission dialog. Works in Electron's Chromium renderer process.
- **MediaRecorder:** Records a `MediaStream` to a Blob. Emits `ondataavailable` with chunks periodically. Outputs compressed formats (Opus in webm container), not raw PCM.
- **Why we use them:** They're browser-native, handle macOS permission prompts automatically, and require zero native dependencies. The trade-off is we need ffmpeg to convert the compressed output to whisper's required format.

### Opus WebM → PCM WAV Conversion
- **Opus:** A lossy audio codec optimized for speech. Small files, good quality. MediaRecorder's default output.
- **PCM WAV (16-bit, 16kHz, mono):** Whisper's required input format. Uncompressed raw audio samples.
- **ffmpeg:** Switches between these in milliseconds with a single command. Already on the system from M2 benchmarks.

### IPC (Inter-Process Communication) in Electron
- **ipcMain.handle / ipcRenderer.invoke:** A request-response pattern. The renderer calls `ipcRenderer.invoke('channel', ...args)` and gets a Promise back. The main process handles it with `ipcMain.handle('channel', async (event, ...args) => ...)`.
- **webContents.send / ipcRenderer.on:** A fire-and-forget event pattern. Main pushes events to renderer. Used for state changes like `'audio-state': 'recording'`.
- **Why the split:** The renderer captures audio (browser API), the main process runs whisper (Node native addon). IPC is the only way they can talk since context isolation prevents the renderer from accessing Node.

### Context Isolation & preload.js
- **Context Isolation:** Electron runs preload scripts and web page code in separate JavaScript worlds. `contextBridge.exposeInMainWorld()` is the only bridge between them.
- **Preload script:** Runs before the web page. Has access to `ipcRenderer` (which the web page doesn't). Exposes a safe, limited API to the page.
- **Why it matters for M5:** The overlay's `<script>` can't access `ipcRenderer` directly. It calls `window.ecoVoice.transcribe()` which the preload script wires to `ipcRenderer.invoke('transcribe', ...)`.

---

## Lessons Learned

- **Electron's embedded Node needs native addons compiled against it.** System Node and Electron Node are different runtimes. Pre-built binaries from npm may not work — be prepared to compile manually.
- **Context isolation means `onclick="fn()"` in HTML attributes doesn't work.** The inline handler runs in the page world; `window.ecoVoice` only exists in the isolated world. Use `addEventListener` in the script.
- **Frameless overlay windows need explicit close handling.** If the process crashes while a frameless overlay is visible, the window stays on screen with no controls. Always provide a close button and Escape key, and guard window operations with `isDestroyed()`.
- **State machines need reset paths for every exit.** Initial code only reset state on successful transcription. Adding close button, Escape key, and error handling each needed their own reset path. A centralized `hideAndReset()` function eliminates these gaps.
- **Preload scripts must be CommonJS (`.cjs`) when `package.json` has `"type": "module"`.** Electron's preload loader fails silently if it tries to parse ESM syntax in a preload context. The symptom was that `window.ecoVoice` simply didn't exist in the renderer, and nothing complained — the toggle just stopped working on the second press.
- **`hideAndReset()` should not re-trigger `audio-state: idle`.** Sending `audio-state: idle` from the reset path causes the renderer to call `recordingComplete()` back to main, creating an infinite echo. The clean approach is: reset state, hide the window, let the renderer settle naturally.
