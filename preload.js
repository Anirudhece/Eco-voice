import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("ecoVoice", {
  status: () => "ready"
});
