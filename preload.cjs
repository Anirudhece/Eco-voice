const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ecoVoice", {
  transcribe: (audioBuffer) => ipcRenderer.invoke("transcribe", audioBuffer),

  recordingComplete: () => ipcRenderer.invoke("recording-complete"),

  closeOverlay: () => ipcRenderer.invoke("close-overlay"),

  getAudioState: () => ipcRenderer.invoke("get-audio-state"),

  getPolishMode: () => ipcRenderer.invoke("get-polish-mode"),

  setPolishMode: (enabled) => ipcRenderer.invoke("set-polish-mode", enabled),

  onAudioStateChange: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("audio-state", handler);
    return () => ipcRenderer.removeListener("audio-state", handler);
  },

  onTranscribeResult: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on("transcribe-result", handler);
    return () => ipcRenderer.removeListener("transcribe-result", handler);
  }
});
