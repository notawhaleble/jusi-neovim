const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jusi", {
  async getInitialState() {
    return await ipcRenderer.invoke("jusi:get-initial-state");
  },
  onStateChanged(listener) {
    ipcRenderer.on("jusi:state", (_event, state) => {
      listener(state);
    });
  },
  async sendInput(keys) {
    await ipcRenderer.invoke("jusi:input", keys);
  },
  async resize(columns, lines) {
    await ipcRenderer.invoke("jusi:resize", columns, lines);
  },
  async runCommand(command) {
    await ipcRenderer.invoke("jusi:command", command);
  },
  async focusWindow(windowId) {
    await ipcRenderer.invoke("jusi:focus-window", windowId);
  },
});
