# Milestone 8 — Packaging + Performance Hardening

## Overview

Bundle EcoVoice into a standalone `.app`/`.dmg` so it runs without Node.js/npm, then verify performance holds up in the packaged runtime. This makes M8 about **production readiness**: distribution, native module bundling, and sustained performance.

## What's in Scope

### 1. electron-builder Setup
- Add `electron-builder` as devDependency
- Add build config to `package.json`: target `.dmg` for macOS (arm64), app icon, output directory
- Need a `.icns` icon — create a simple one from an SVG or use a placeholder
- `appId`: `com.ecovoice.app`
- App name: "EcoVoice" (shown in Finder, dock, About)

### 2. Native Binary Bundling
The main risk. Three native things must survive ASAR packaging:

**whisper.cpp binary** (`node_modules/whisper-node/lib/whisper.cpp/main`):
- whisper-node execs `./main` from its lib directory
- Inside an ASAR archive, binary blobs can't execute
- Fix: `"asarUnpack": "node_modules/whisper-node/**"` unpacks the whole tree

**node-llama-cpp Metal bindings**:
- Compiles a native `.node` addon with Metal GPU support
- Same ASAR problem — must live outside the archive
- Fix: `"asarUnpack": "node_modules/node-llama-cpp/**"` (or electron-builder auto-unpacks `.node` files — verify)

**ffmpeg dependency**:
- Currently relies on system `ffmpeg` (installed via Homebrew) — won't exist on other machines
- Fix: Bundle `@ffmpeg-installer/ffmpeg` npm package — ships a prebuilt ffmpeg binary. ~70MB added, but zero user setup.

### 3. Bundle Whisper Base Model (142MB)

The whisper base.en model is **mandatory for all transcription** — without it the app can't convert speech to text. Currently users must download it from the settings page on first launch, which means: app installs → opens → "can't do anything yet, download a model first." That's a bad first impression for a mandatory dependency.

**Fix: Ship the model inside the `.dmg`.**

- Place `ggml-base.en.bin` (142MB) in the app's `Resources/` directory via electron-builder's `extraResources` config
- On first launch, `main.js` copies the model from `process.resourcesPath` to `~/Library/Application Support/EcoVoice/models/` if not already present
- After copy completes, transcription works immediately — zero download, zero wait
- Model downloads in settings become: Whisper shows "Installed" (it shipped with the app), Qwen still shows "Download" (1.2GB is too big to bundle)

**Why not bundle Qwen too?**
- Qwen is 1.2GB (vs 142MB for Whisper)
- Qwen is optional — many users will use Gemini API instead
- Adding 1.2GB to the `.dmg` would make it ~1.5GB total — too large for a simple download
- Qwen stays as an optional post-install download

**Implementation:**
```
electron-builder config:
  "extraResources": [
    { "from": "models/ggml-base.en.bin", "to": "ggml-base.en.bin" }
  ]

main.js on first launch:
  if (!fs.existsSync(path.join(getModelsPath(), "ggml-base.en.bin"))) {
    const bundledModel = path.join(process.resourcesPath, "ggml-base.en.bin");
    if (fs.existsSync(bundledModel)) {
      fs.copyFileSync(bundledModel, path.join(getModelsPath(), "ggml-base.en.bin"));
    }
  }
```

### 4. app.getPath('userData') Migration
- `config.js` hardcodes `~/Library/Application Support/EcoVoice/`
- In a packaged app, should use Electron's path resolution
- Change `config.js` to accept a base path from main.js

### 5. App Icon
- Simple `.icns` — just needs to be recognizable in the dock
- Can generate from a 1024x1024 PNG using iconutil

### 6. Code Signing (ad-hoc only for Phase 1)
- Without a paid Apple Developer account, we can't notarize
- Ad-hoc signature (electron-builder default): app runs, macOS shows "unidentified developer" → users right-click → Open to bypass
- Acceptable for self-distribution. Notarization can be added later without code changes.

### 7. Performance Hardening (scaled-down original M8 scope)
- **Model offload after 5 min idle**: Qwen context disposed. Reloads on next polish use (+~500ms). Whisper stays loaded (small, used every time).
- **Verify packaged performance**: 3-5 real recordings confirm ASR/LLM speeds match dev benchmarks
- **Skip battery/thermal monitoring** — M9 dogfooding surfaces these naturally

## Files to Create

- `assets/icon.png` (1024x1024) → converted to `.icns` by electron-builder
- `entitlements.mac.plist` — minimal entitlements for mic + accessibility

## Files to Copy

- Copy `~/Library/Application Support/EcoVoice/models/ggml-base.en.bin` to `models/ggml-base.en.bin` in the project root (so electron-builder can bundle it)

## Files to Modify

### `package.json`
```json
{
  "build": {
    "appId": "com.ecovoice.app",
    "productName": "EcoVoice",
    "mac": {
      "target": "dmg",
      "icon": "assets/icon.png",
      "entitlements": "entitlements.mac.plist"
    },
    "asarUnpack": [
      "node_modules/whisper-node/**",
      "node_modules/node-llama-cpp/**"
    ],
    "extraResources": [
      { "from": "models/ggml-base.en.bin", "to": "ggml-base.en.bin" }
    ]
  },
  "scripts": {
    "build": "electron-builder",
    "pack": "electron-builder --dir"
  }
}
```

### `main.js`
- `webm → wav` conversion: use `@ffmpeg-installer/ffmpeg` path instead of system ffmpeg
- `app.whenReady()` → pass `app.getPath('userData')` to config init
- First launch: copy bundled whisper model from `process.resourcesPath` to Application Support
- Model offload timer: 5-min interval, dispose Qwen context if no recent polish

### `config.js`
- Accept `appDataPath` parameter for `app.getPath('userData')`

### Dependencies
- Add `electron-builder` (devDependency)
- Add `@ffmpeg-installer/ffmpeg` (dependency)

## What's NOT in Scope
- Windows/Linux builds — macOS only
- Apple notarization — ad-hoc signing only
- Auto-updater — manual `.dmg` distribution
- Battery/thermal benchmarks — deferred to M9

## Verification

1. `npm run build` produces `dist/EcoVoice-0.1.0-arm64.dmg`
2. Open `.dmg`, drag to Applications, launch — no terminal, no Node.js
3. **Whisper works immediately** on first launch — no download needed, model ships with the app
4. Record voice → text injected into focused app ✅
5. Download Qwen → toggle polish → record → polished text ✅
6. Gemini API polish works ✅
7. Settings + models persist across app restarts ✅
8. Model offload: idle 5+ min → Qwen unloaded → next polish reloads ✅

## Risk: Native Binary ASAR Unpacking

If whisper-node can't find `./main` or node-llama-cpp's Metal bindings don't resolve, packaged app crashes on first recording/polish.

**Mitigation**: Test with `electron-builder --dir` first (unpacked build, no ASAR), verify everything works, then graduate to full `.dmg` with ASAR unpack config.
