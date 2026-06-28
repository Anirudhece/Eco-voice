import { app, globalShortcut, BrowserWindow, screen, ipcMain, clipboard } from "electron";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import whisperModule from "whisper-node";

const whisper = whisperModule.whisper;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let overlay = null;
let recordingState = "idle";

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
    width: 320,
    height: 100,
    x: Math.round((screenWidth - 320) / 2),
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

app.whenReady().then(async () => {
  createOverlay();

  const registered = globalShortcut.register("Alt+Space", () => {
    toggleRecording();
  });

  if (!registered) {
    console.error("Failed to register global shortcut Alt+Space");
  }

  console.log("EcoVoice ready. Press Option+Space to toggle recording.");

  ipcMain.handle("get-audio-state", () => recordingState);

  ipcMain.handle("close-overlay", () => {
    hideAndReset();
  });

  ipcMain.handle("recording-complete", () => {
    hideAndReset();
  });

  ipcMain.handle("transcribe", async (_event, audioBuffer) => {
    const tmpDir = os.tmpdir();
    const webmPath = path.join(tmpDir, `ecovoice-${Date.now()}.webm`);
    const wavPath = webmPath.replace(/\.webm$/, ".wav");

    try {
      await fs.writeFile(webmPath, Buffer.from(audioBuffer));
      await convertWebmToWav(webmPath, wavPath);

      const start = Date.now();
      const result = await whisper(wavPath, { modelName: "base.en" });

      const elapsed = (Date.now() - start) / 1000;
      const text = Array.isArray(result) ? result.map(s => s.speech.trim()).join(" ") : String(result);

      hideAndReset();

      try {
        await injectText(text);
      } catch {
        // Text already on clipboard — user can Cmd+V manually
      }

      console.log(`[${elapsed.toFixed(2)}s] ${text}`);
      overlay.webContents.send("transcribe-result", { text });

      return { success: true, text, elapsed };
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
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
