import { app, globalShortcut, BrowserWindow, screen, ipcMain, clipboard } from "electron";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import whisperModule from "whisper-node";
import { loadConfig, saveConfig, getModelsPath } from "./config.js";
import { createGrammarEngine } from "./grammar-engine.js";
import { isModelDownloaded, downloadModel } from "./model-downloader.js";

const whisper = whisperModule.whisper;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let overlay = null;
let settingsWindow = null;
let recordingState = "idle";
let polishMode = false;
let grammarEngine = null;
let appConfig = null;

function hideAndReset() {
  recordingState = "idle";
  if (overlay && !overlay.isDestroyed()) {
    overlay.hide();
  }
}

function injectText(text) {
  clipboard.writeText(text);

  return new Promise((resolve, reject) => {
    execFile("osascript", [
      "-e",
      'tell application "System Events" to keystroke "v" using command down'
    ], (err) => {
      if (err) {
        console.error("[Inject] osascript failed — text on clipboard for manual paste:", err.message);
        return reject(err);
      }
      console.log(`[Inject] Pasted: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`);
      resolve();
    });
  });
}

function createOverlay() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  overlay = new BrowserWindow({
    width: 340,
    height: 100,
    x: Math.round((screenWidth - 340) / 2),
    y: 120,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    type: "panel",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  overlay.loadFile("overlay.html");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.hide();

  overlay.on("close", () => {
    overlay = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 540,
    resizable: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "settings-preload.cjs")
    }
  });

  settingsWindow.loadFile("settings.html");

  settingsWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      settingsWindow.hide();
    }
  });
}

function toggleRecording() {
  if (!overlay) return;

  if (recordingState === "idle") {
    recordingState = "recording";
    overlay.show();
    overlay.webContents.send("audio-state", "recording");
  } else if (recordingState === "recording") {
    recordingState = "processing";
    overlay.webContents.send("audio-state", "idle");
  } else {
    hideAndReset();
  }
}

function convertWebmToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-acodec", "pcm_s16le",
      "-ac", "1",
      "-ar", "16000",
      outputPath
    ], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// ── Setup IPC handlers ──────────────────────────────────

function setupIpcHandlers() {
  ipcMain.handle("get-audio-state", () => recordingState);

  ipcMain.handle("close-overlay", () => {
    hideAndReset();
  });

  ipcMain.handle("recording-complete", () => {
    hideAndReset();
  });

  ipcMain.handle("get-polish-mode", () => polishMode);

  ipcMain.handle("set-polish-mode", (_event, enabled) => {
    polishMode = !!enabled;
  });

  ipcMain.handle("transcribe", async (_event, audioBuffer) => {
    const tmpDir = os.tmpdir();
    const webmPath = path.join(tmpDir, `ecovoice-${Date.now()}.webm`);
    const wavPath = webmPath.replace(/\.webm$/, ".wav");

    try {
      await fs.writeFile(webmPath, Buffer.from(audioBuffer));
      await convertWebmToWav(webmPath, wavPath);

      const asrStart = Date.now();
      const whisperModelPath = path.join(getModelsPath(), "ggml-base.en.bin");
      const result = await whisper(wavPath, { modelPath: whisperModelPath });
      const asrElapsed = (Date.now() - asrStart) / 1000;

      const rawText = Array.isArray(result)
        ? result.map(s => s.speech.trim()).join(" ")
        : String(result);

      let finalText = rawText;

      if (polishMode && grammarEngine) {
        try {
          const polishStart = Date.now();
          finalText = await grammarEngine.polish(rawText);
          const polishElapsed = (Date.now() - polishStart) / 1000;

          hideAndReset();

          try { await injectText(finalText); } catch { /* clipboard fallback */ }

          console.log(`[${asrElapsed.toFixed(2)}s ASR + ${polishElapsed.toFixed(2)}s polish] ${finalText}`);
          overlay.webContents.send("transcribe-result", { text: finalText, raw: rawText, mode: "polish" });

          return { success: true, text: finalText, raw: rawText, mode: "polish", asrElapsed, polishElapsed };
        } catch (polishErr) {
          console.error("[Polish] Error — falling back to raw text:", polishErr.message);
          finalText = rawText;
        }
      }

      hideAndReset();

      try { await injectText(finalText); } catch { /* clipboard fallback */ }

      console.log(`[${asrElapsed.toFixed(2)}s ASR] ${finalText}`);
      overlay.webContents.send("transcribe-result", { text: finalText, raw: rawText, mode: polishMode ? "polish" : "raw" });

      return { success: true, text: finalText, raw: rawText, mode: polishMode ? "polish" : "raw", asrElapsed };
    } catch (err) {
      console.error("[Transcribe] Error:", err.message);
      hideAndReset();
      overlay.webContents.send("audio-state", { state: "error", message: err.message });
      return { success: false, error: err.message };
    } finally {
      await fs.unlink(webmPath).catch(() => {});
      await fs.unlink(wavPath).catch(() => {});
    }
  });

  // ── Settings IPC ──

  ipcMain.handle("settings-get-config", async () => {
    return loadConfig();
  });

  ipcMain.handle("settings-save-config", async (_event, config) => {
    await saveConfig(config);
    appConfig = config;

    // Reload grammar engine with new config
    grammarEngine = await createGrammarEngine(appConfig);
    return { success: true };
  });

  ipcMain.handle("settings-get-model-status", () => {
    return {
      whisper: isModelDownloaded("whisper"),
      qwen: isModelDownloaded("qwen")
    };
  });

  ipcMain.handle("settings-download-model", async (event, modelKey) => {
    try {
      await downloadModel(modelKey, (progress) => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send("settings-download-progress", progress);
        }
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

// ── App lifecycle ────────────────────────────────────────

app.whenReady().then(async () => {
  appConfig = await loadConfig();

  createOverlay();
  createSettingsWindow();

  setupIpcHandlers();

  // Init grammar engine
  grammarEngine = await createGrammarEngine(appConfig);

  const registered = globalShortcut.register("Alt+Space", () => {
    toggleRecording();
  });

  if (!registered) {
    console.error("Failed to register global shortcut Alt+Space");
  }

  console.log("EcoVoice ready. Press Option+Space to toggle recording.");
  console.log(`  Grammar engine: ${appConfig.grammarEngine}`);
  console.log(`  Whisper model: ${isModelDownloaded("whisper") ? "downloaded" : "missing"}`);
  console.log(`  Qwen model: ${isModelDownloaded("qwen") ? "downloaded" : "missing"}`);

  // First-run: show settings
  if (!appConfig.setupComplete) {
    settingsWindow.show();
    settingsWindow.focus();
  }
});

app.on("activate", () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
  } else {
    createSettingsWindow();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Don't quit — macOS convention for background apps
});
