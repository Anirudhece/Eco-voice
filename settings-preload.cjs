const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ecoVoiceSettings", {
  getConfig: () => ipcRenderer.invoke("settings-get-config"),

  saveConfig: (config) => ipcRenderer.invoke("settings-save-config", config),

  downloadModel: (modelKey) => ipcRenderer.invoke("settings-download-model", modelKey),

  onDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on("settings-download-progress", handler);
    return () => ipcRenderer.removeListener("settings-download-progress", handler);
  },

  getModelStatus: () => ipcRenderer.invoke("settings-get-model-status")
});
