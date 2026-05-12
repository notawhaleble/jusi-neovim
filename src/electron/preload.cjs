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
  onWebScroll(listener) {
    ipcRenderer.on("jusi:web-scroll", (_event, event) => {
      listener(event);
    });
  },
  onWebOpenLink(listener) {
    ipcRenderer.on("jusi:web-open-link", (_event, event) => {
      listener(event);
    });
  },
  onWebEnterMode(listener) {
    ipcRenderer.on("jusi:web-enter-mode", (_event, event) => {
      listener(event);
    });
  },
  onLeaveWebMode(listener) {
    ipcRenderer.on("jusi:leave-web-mode", () => {
      listener();
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
  async setCursor(windowId, row, col) {
    await ipcRenderer.invoke("jusi:set-cursor", windowId, row, col);
  },
  async updateWebMirror(bufferId, mirror) {
    await ipcRenderer.invoke("jusi:update-web-mirror", bufferId, mirror);
  },
});
