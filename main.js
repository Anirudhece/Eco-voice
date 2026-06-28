import { app, globalShortcut, BrowserWindow, screen, ipcMain } from "electron";
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
  console.log(`[hideAndReset] Called, current state: ${recordingState}`);
  recordingState = "idle";
  if (overlay && !overlay.isDestroyed()) {
    console.log("[hideAndReset] Hiding overlay");
    overlay.hide();
  } else {
    console.log(`[hideAndReset] Overlay ${!overlay ? "null" : "destroyed"}`);
  }
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
  console.log(`[Toggle] Called, current state: ${recordingState}`);

  if (!overlay) {
    console.log("[Toggle] No overlay window — aborting");
    return;
  }

  if (recordingState === "idle") {
    console.log("[Toggle] idle → recording");
    recordingState = "recording";
    overlay.show();
    overlay.webContents.send("audio-state", "recording");
  } else if (recordingState === "recording") {
    console.log("[Toggle] recording → processing");
    recordingState = "processing";
    overlay.webContents.send("audio-state", "idle");
  } else if (recordingState === "processing") {
    console.log("[Toggle] Already processing — forcing idle reset");
    hideAndReset();
  } else {
    console.log(`[Toggle] Unknown state: ${recordingState} — resetting`);
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
    console.log("[IPC] close-overlay received");
    hideAndReset();
  });

  ipcMain.handle("recording-complete", () => {
    console.log(`[IPC] recording-complete received, state: ${recordingState}`);
    hideAndReset();
  });

  ipcMain.handle("transcribe", async (_event, audioBuffer) => {
    const tmpDir = os.tmpdir();
    const webmPath = path.join(tmpDir, `ecovoice-${Date.now()}.webm`);
    const wavPath = webmPath.replace(/\.webm$/, ".wav");

    try {
      console.log(`[Transcribe] Writing webm buffer (${audioBuffer.byteLength} bytes) to ${webmPath}`);
      await fs.writeFile(webmPath, Buffer.from(audioBuffer));

      console.log("[Transcribe] Converting webm → wav (16kHz mono PCM)");
      await convertWebmToWav(webmPath, wavPath);

      console.log("[Transcribe] Running Whisper base.en");
      const start = Date.now();
      const result = await whisper(wavPath, { modelName: "base.en" });

      const elapsed = (Date.now() - start) / 1000;
      const text = Array.isArray(result) ? result.map(s => s.speech.trim()).join(" ") : String(result);

      console.log(`[Transcribe] Done in ${elapsed.toFixed(2)}s: "${text}"`);

      hideAndReset();
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
