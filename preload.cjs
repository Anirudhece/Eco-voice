const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ecoVoice", {
  transcribe: (audioBuffer) => {
    console.log(`[Preload] transcribe called, buffer: ${audioBuffer.byteLength} bytes`);
    return ipcRenderer.invoke("transcribe", audioBuffer);
  },

  recordingComplete: () => {
    console.log("[Preload] recordingComplete called");
    return ipcRenderer.invoke("recording-complete");
  },

  closeOverlay: () => {
    console.log("[Preload] closeOverlay called");
    return ipcRenderer.invoke("close-overlay");
  },

  getAudioState: () => {
    console.log("[Preload] getAudioState called");
    return ipcRenderer.invoke("get-audio-state");
  },

  onAudioStateChange: (callback) => {
    const handler = (_event, state) => {
      console.log(`[Preload] audio-state event received: ${JSON.stringify(state)}`);
      callback(state);
    };
    ipcRenderer.on("audio-state", handler);
    return () => ipcRenderer.removeListener("audio-state", handler);
  },

  onTranscribeResult: (callback) => {
    const handler = (_event, result) => {
      console.log(`[Preload] transcribe-result event received: ${JSON.stringify(result)}`);
      callback(result);
    };
    ipcRenderer.on("transcribe-result", handler);
    return () => ipcRenderer.removeListener("transcribe-result", handler);
  }
});
