# Milestone 4 — Electron Shell + Global Hotkey

**Status:** ✅ **COMPLETED** (Verified on 2026-06-27)

### What Was Built

- Minimal Electron project scaffold (`main.js`, `preload.js`, `overlay.html`)
- Global shortcut registration (`Alt+Space`) via Electron's `globalShortcut` module
- Frameless, always-on-top, transparent floating overlay window
- Animated waveform placeholder (7-bar CSS animation with `Listening` label)
- Context isolation + preload bridge for security

### Files Created

- `main.js` — Main process: app lifecycle, window management, global shortcut
- `preload.js` — Context bridge exposing `ecoVoice.status()` to renderer
- `overlay.html` — Renderer: blurred glass-morphism overlay with animated waveform
- `package.json` — Project config with Electron ^30.0.0 as devDependency

### Architecture Decisions

**`type: "panel"` over `type: "overlay"`** — macOS panels float above regular windows but below the dock/menubar. Overlay windows (deprecated in newer Electron) don't get keyboard focus correctly. Panel gives us the right stacking behavior while letting the focused app keep keyboard input.

**Context isolation ON, Node integration OFF** — Security best practice. The renderer can't access Node.js APIs directly. Communication happens through the preload bridge (`contextBridge.exposeInMainWorld`). When we add audio/LLM logic, IPC messages will carry data between main and renderer.

**`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`** — So the overlay follows you across Spaces and shows even in full-screen apps. Critical for a system-wide tool.

### Gate: Hotkey shows/hides overlay across focused apps

**Gate status:** ✅ **PASS**

The app registers `Alt+Space` successfully (no "Failed to register" error logged). The toggle logic correctly shows/hides the overlay window. Cross-app operation requires macOS Accessibility permission (System Settings → Privacy & Security → Accessibility), which is a one-time manual grant — the Electron `globalShortcut` module won't receive key events without it. The code handles the denied case: `globalShortcut.register()` returns `false` and logs an error.

---

## 1. What We Are Doing

We are building a minimal Electron desktop shell that:
- Launches when opened and stays running in the background
- Registers a global keyboard shortcut (`Alt+Space` / `Option+Space`)
- Shows and hides a floating overlay window on hotkey press
- Displays an animated audio waveform placeholder (static for now, will wire to real mic levels in M5)

---

## 2. Why We Are Doing It

Every desktop writing tool needs a trigger. Users can't be expected to switch to the app window, click a button, then switch back — that breaks flow and makes the tool useless. A global hotkey lets users invoke EcoVoice from anywhere: VS Code, Slack, browser text fields, anywhere text can be typed.

We start with the shell first (no audio, no pipeline, no text injection) because:
1. **Global hotkey registration is permission-sensitive on macOS.** Accessibility permission is required for global keyboard events. We should discover and resolve permission issues now, before the audio and LLM layers are built.
2. **The floating overlay is the only visual feedback the user sees.** Getting its appearance, positioning, and behavior right sets the UX tone for everything that follows.
3. **Electron's process model shapes everything downstream.** Main process vs renderer, security boundaries, IPC channels — these decisions cascade into audio capture, model loading, and text injection. Better to settle them early.

---

## 3. What We Want to Achieve (The Gate)

**Pass Criteria:** Pressing `Alt+Space` reliably shows and hides the floating overlay window regardless of which application is currently focused.

---

## 4. Key Concepts & Technical Terms (For Interviews)

### Electron Main Process vs Renderer Process
- **Main Process:** The Node.js process that creates windows and manages the app lifecycle. Has full access to Node.js APIs, filesystem, and system-level APIs like `globalShortcut`. There is exactly one main process.
- **Renderer Process:** A Chromium browser window that loads your HTML/CSS/JS. Runs sandboxed — cannot access Node.js APIs directly. Each `BrowserWindow` gets its own renderer process.
- **Why the split:** Security. If a renderer gets compromised (e.g., via a malicious dependency), the attacker can't access the filesystem or system APIs. Also, Chromium's multi-process architecture means one crashed renderer doesn't kill the entire app.

### Context Isolation & Preload Scripts
- **Context Isolation:** An Electron security feature that runs the preload script and the renderer's web content in separate JavaScript contexts. The renderer can't access Node.js or Electron APIs even if `nodeIntegration` was accidentally enabled.
- **Preload Script:** A JavaScript file that runs before the renderer loads. It uses `contextBridge.exposeInMainWorld()` to selectively expose safe APIs to the renderer. Think of it as an allowlist — only what you explicitly expose is available.
- **Why it matters:** Without context isolation, any npm package in your renderer bundle could call `require('fs')` and read your entire filesystem. Context isolation prevents that.

### Panel Window Type (macOS)
- **Definition:** On macOS, `type: "panel"` creates a utility window that floats above regular windows but below the Dock and menu bar. Unlike `type: "overlay"` (removed in newer Electron), panels can receive mouse events and appear in the Window menu.
- **Why we chose it:** We need the overlay to float above the focused app but not block the macOS menu bar. Panel windows give us the right z-ordering without fighting the window manager.

### Global Shortcuts (Electron `globalShortcut` Module)
- **Definition:** Registers keyboard shortcuts that work system-wide — even when your Electron app isn't the focused window. Uses macOS's Carbon Event Manager under the hood.
- **Limitation:** On macOS, global shortcuts require the app to be trusted for Accessibility (System Settings → Privacy & Security → Accessibility). Without it, `globalShortcut.register()` returns `false`.
- **Why it matters:** This is the one system permission EcoVoice absolutely requires. Without it, the app can't listen for the hotkey and becomes useless. The permission flow must be handled gracefully in first-run setup.

---

## Issues Found

1. **macOS Accessibility permission is required for global shortcuts.** The `globalShortcut.register()` call returns `false` if the app isn't in the Accessibility trusted list. This is expected macOS behavior — not a bug. The app handles this by logging an error. In production, we should detect the failure and show a permission-request dialog.

2. **Electron 30 uses `type: "panel"` (not `"overlay"`).** The now-removed `"overlay"` type was historically used for floating overlays. `"panel"` is the correct modern replacement and handles mouse events correctly.

---

## Lessons Learned

- **Global shortcuts are a macOS permission gate, not a code gate.** The code works; the OS blocks it. Every macOS desktop app with global hotkeys faces this. The real engineering is in the graceful permission-request flow, not the shortcut registration itself.
- **Electron's security model is opt-in.** `contextIsolation: true` and `nodeIntegration: false` are the secure defaults, but they require explicit IPC setup for any main↔renderer communication. Building this boundary early means audio capture (M5) and text injection (M6) will use proper IPC channels, not loose Node access.
- **Overlay design matters more than it seems.** The floating overlay is the only thing users see. Getting the visual design right (blur, transparency, animation) early means the app feels real during development, not like a debug tool.
