# Research M6 — macOS Text Injection Approaches for Electron

## What Was Tested

We evaluated 6 approaches for injecting transcribed text into the active app from an Electron process on macOS. The requirements: must work system-wide (not just within the Electron window), handle multi-line text, and impose minimal build complexity.

## Results

### Approach 1: `clipboard.writeText()` + `webContents.sendInputEvent()`
**Does not work.** Electron's `sendInputEvent()` only targets its own renderer window. It cannot send keystrokes to other applications. A common misconception — this API is for automated testing of Electron UI, not system-wide injection.

### Approach 2: RobotJS / nut.js (Native keyboard simulation)
**Works.** Both call `CGEventPost` under the hood. RobotJS has fragile `node-gyp` builds on Apple Silicon (often needs manual rebuild). nut.js is better maintained with arm64 prebuilds but adds ~10MB of native binaries and cmake dependencies. Both require Accessibility permission.

### Approach 3: AppleScript `osascript` + Cmd+V
**Works. Chosen for EcoVoice.** One shell command: `osascript -e 'tell app "System Events" to keystroke "v" using command down'`. Same macOS Accessibility API as RobotJS/nut.js but zero build complexity, ARM-native by default, ships with every Mac. 30-100ms latency (process spawn) which is imperceptible for paste injection. Built-in clipboard fallback since `clipboard.writeText()` runs independently.

### Approach 4: CGEvent C addon (direct CoreGraphics)
**Works, fastest (1-5ms).** Would require maintaining a native Node addon in Objective-C with `binding.gyp` across Electron upgrades. Overkill for simple paste injection — the 30-100ms `osascript` latency is not perceptible to users.

### Approach 5: Electron built-ins (`shell`, `desktopCapturer`, etc.)
**None exist.** Electron has no API for system-wide text injection or keystroke simulation beyond `sendInputEvent()`.

### Approach 6: `pbcopy` + `osascript`
**Works, functionally identical to Approach 3.** `pbcopy` writes to the same general pasteboard as `electron.clipboard.writeText()`. No advantage over Approach 3 for our use case.

## Issues Found

- **Two permission prompts with AppleScript.** macOS requires both Accessibility permission (for System Events) AND Automation permission (to send keystrokes). This is two separate dialogs. For development, granting Accessibility to the terminal running `npm start` is sufficient since Electron inherits the parent's permissions.

## Lessons Learned

- **`sendInputEvent()` is a testing API, not an injection API.** A trap many Electron developers fall into — it looks like it should work cross-app, but the docs confirm it's window-scoped.
- **AppleScript `keystroke` is the sweet spot for macOS injection.** It's fast enough, requires no build tooling, and uses the same underlying OS APIs as native libraries. For paste-only injection (vs. complex automation), it's the right tool.
- **Clipboard-as-bridge is the universal pattern.** Every dictation tool on macOS (MacWhisper, Wispr Flow, Superwhisper) uses clipboard + Cmd+V. The clipboard is the lingua franca of text transfer between macOS processes.
- **Natural timing matters.** AppleScript adds a tiny delay between events that mimics human typing speed. Some apps (particularly Electron-based ones and Google Docs) drop synthetic keystrokes that fire too fast — AppleScript's timing actually helps reliability here vs raw CGEvent posting.

## Decision

Use AppleScript `osascript` + `clipboard.writeText()` for M6. Revisit only if edge-case apps (Google Docs, password fields) become a dogfooding pain point in M9.
