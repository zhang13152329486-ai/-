const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("DesktopDaily", {
  refresh: () => ipcRenderer.invoke("daily:refresh"),
  root: () => ipcRenderer.invoke("app:root"),
  logPath: () => ipcRenderer.invoke("app:logPath")
});
