# Milestone 6 — System Text Injection

**Status:** ✅ Completed

## What We Are Doing

We take the transcribed text from Whisper and inject it into whatever text field currently has focus — a VS Code editor, a Slack message box, a browser textarea, anything the user is typing into. The approach: write the text to the system clipboard via Electron's `clipboard` module, then simulate a Cmd+V keystroke system-wide via `osascript` (AppleScript). If macOS denies the keystroke due to missing Accessibility permissions, the text stays on the clipboard as a safeguard — the user just presses Cmd+V manually.

## Why We Are Doing It

M5 proved we can capture audio and transcribe it. But transcription that only prints to the terminal is useless in practice. The whole point of EcoVoice is to type into real apps without touching the keyboard. This is the critical bridge from "works in dev tools" to "actually useful."

We chose AppleScript over native keyboard libraries (RobotJS, nut.js, CGEvent C addon) because:
- **Zero build complexity.** `osascript` ships with macOS, ARM-native, no `node-gyp` or `@electron/rebuild` needed.
- **Same reliability as native approaches.** AppleScript's `keystroke` command uses the same macOS Accessibility API that RobotJS/nut.js/CGEvent use under the hood. If Cmd+V works manually in an app, this approach works too.
- **Built-in clipboard fallback.** Even if `osascript` fails, `clipboard.writeText()` already ran — so the text is on the pasteboard, ready for manual Cmd+V.
- **Natural timing.** AppleScript adds a tiny delay between modifier-down and key-down (matching human typing speed), which helps apps that drop synthetic keystrokes that fire too fast.

## Architecture: Clipboard + Cmd+V Flow

```
whisper returns text "Hello, how are you?"
  → hideAndReset() — overlay dismissed
  → injectText(text):
      1. clipboard.writeText(text)  ← text on pasteboard
      2. osascript -e 'tell app "System Events" to keystroke "v" using command down'
      3. if osascript succeeds → text pasted into focused app ✅
      4. if osascript fails → text stays on clipboard, user Cmd+V manually ⚠️
  → console.log speed + transcription
```

No renderer involvement — injection is entirely in the main process. The overlay is already hidden when paste fires, so the target app has full focus.

## macOS Permission Handling

The first time `osascript` runs `keystroke "v" using command down`, macOS triggers a native permission dialog:

> "EcoVoice" would like to control this computer using accessibility features.

The user must:
1. Open System Settings → Privacy & Security → Accessibility
2. Enable the toggle for "EcoVoice" (or "Electron")

Until this is granted, `osascript` will fail with a permission error. Our code catches this gracefully — the text stays on the clipboard.

**Important:** The terminal/IDE running `npm start` also needs Accessibility permission, since that's the parent process launching Electron. If `osascript` is invoked from that context, it inherits the parent's permissions. In production (packaged Electron app), only the app itself needs the permission.

## Key Concepts & Technical Terms

### macOS Accessibility API
The system framework that allows assistive tools (screen readers, dictation apps, automation tools) to observe and control other applications. AppleScript's `System Events` uses this API for `keystroke`. Without it, synthetic input events are dropped by the window server.

### AppleScript `keystroke` Command
Not a raw CGEvent — it goes through the `System Events` scripting bridge, which validates permissions and adds natural delays between events. The syntax `keystroke "v" using command down` sends a Cmd key-down, then V key-down with command modifier, then V key-up, then Cmd key-up. This is equivalent to the user pressing and releasing Cmd+V.

### System Clipboard / Pasteboard (`NSPasteboard`)
macOS's general pasteboard — the same one accessed by Cmd+C/Cmd+V in any app. Electron's `clipboard.writeText()` writes to this. Any app can read from it. It's the universal interface for text transfer between processes on macOS.

### `execFile` vs `exec`
We use `execFile` (not `exec`) because:
- **No shell interpolation.** The command and arguments are separate — no risk of injection or escaping issues.
- **Direct process spawn.** Faster than `exec` which spawns a shell first.
- **Returns stderr separately.** Easier to debug permission errors.

### Why Not `sendInputEvent`?
Electron's `webContents.sendInputEvent()` only injects into the **Electron window's own renderer**. It cannot target other applications. It's designed for automated testing of Electron UIs, not system-wide input.

### Why Not RobotJS / nut.js / CGEvent?
| Approach | Why we skipped it |
|---|---|
| RobotJS | Native C addon, fragile `node-gyp` builds on Apple Silicon, adds build complexity for no benefit over osascript |
| nut.js | Modern and well-maintained, but ~10MB of native binaries and cmake deps for what's ultimately one keystroke |
| CGEvent C addon | Maximum control and speed (1-5ms), but requires maintaining a native Node addon with Objective-C across Electron upgrades — heavy maintenance burden |

All three ultimately call the same macOS Accessibility API that `osascript` does. For simple paste injection, the 30-100ms osascript latency is imperceptible.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Text editor (TextEdit, Notes) | ✅ Cmd+V pastes normally |
| VS Code | ✅ Paste works in editor |
| Browser text field (input/textarea) | ✅ Paste works, browser handles paste event |
| Slack message composer | ✅ Paste works via Cmd+V |
| Google Docs in browser | ⚠️ Docs uses custom paste handler — usually works, may need click to focus first |
| Terminal (Terminal.app, iTerm2) | ⚠️ Cmd+V pastes text; if the shell is in a mode that interprets Enter, it could trigger execution — rare but possible |
| Password/secure input fields | ❌ macOS blocks synthetic keystrokes into secure fields by design — security feature, not a bug |
| Accessibility permission denied | ⚠️ Text stays on clipboard, user manually Cmd+V |
| Non-Latin IME active (Chinese/Japanese/Korean) | ✅ Cmd+V is IME-independent — paste always works |
| Full-screen apps | ✅ Overlay uses `visibleOnFullScreen: true`, app refocused after overlay hides |

## Gate Verification

**Gate:** Reliable injection into at least 3 different common app types without corrupting cursor position or triggering unwanted app shortcuts.

**✅ Gate met.** All 4 app types verified on user's hardware:
- ✅ TextEdit — paste works cleanly
- ✅ VS Code — paste lands at cursor position
- ✅ Browser text field (Chrome/Safari) — paste works
- ✅ Slack message composer — paste works
- ✅ Clipboard fallback — confirmed Cmd+V manual paste works when permission denied
- ✅ No cursor corruption or unwanted shortcut triggers in any tested app

## Lessons Learned

- **`sendInputEvent()` is window-scoped, not system-wide.** A common misunderstanding with Electron — it's for automated testing of your own UI, not for controlling other apps.
- **AppleScript `keystroke` is the simplest cross-app injection on macOS.** It's just a shell command. No native addons, no build scripts, no C++ code to maintain.
- **Even when injection fails, clipboard fallback is always available.** `clipboard.writeText()` runs first and is independent of the paste step. This means the app is always useful — worst case, the user just presses Cmd+V.
- **The overlay must hide before paste fires.** If the overlay is still visible, it could intercept the Cmd+V event. `hideAndReset()` runs synchronously before the async `injectText()` call, so the window is gone by the time keystrokes fire.
