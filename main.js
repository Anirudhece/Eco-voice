import { app, globalShortcut, BrowserWindow, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let overlay = null;
let isVisible = false;

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
      preload: path.join(__dirname, "preload.js")
    }
  });

  overlay.loadFile("overlay.html");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.hide();

  overlay.on("close", () => {
    overlay = null;
  });
}

function toggleOverlay() {
  if (!overlay) return;

  if (isVisible) {
    overlay.hide();
    isVisible = false;
  } else {
    overlay.show();
    isVisible = true;
  }
}

app.whenReady().then(() => {
  createOverlay();

  const registered = globalShortcut.register("Alt+Space", () => {
    toggleOverlay();
  });

  if (!registered) {
    console.error("Failed to register global shortcut Alt+Space");
  }

  console.log("EcoVoice ready. Press Option+Space to toggle overlay.");
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
