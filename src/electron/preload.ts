import { contextBridge, ipcRenderer } from "electron";

import { RendererApi, RendererSessionState } from "../renderer/contracts.js";

const api: RendererApi = {
  async getInitialState(): Promise<RendererSessionState> {
    return await ipcRenderer.invoke("jusi:get-initial-state");
  },
  onStateChanged(listener: (state: RendererSessionState) => void): void {
    ipcRenderer.on("jusi:state", (_event: unknown, state: RendererSessionState) => {
      listener(state);
    });
  },
  onWebScroll(listener): void {
    ipcRenderer.on("jusi:web-scroll", (_event: unknown, event) => {
      listener(event);
    });
  },
  onLeaveWebMode(listener): void {
    ipcRenderer.on("jusi:leave-web-mode", () => {
      listener();
    });
  },
  async sendInput(keys: string): Promise<void> {
    await ipcRenderer.invoke("jusi:input", keys);
  },
  async resize(columns: number, lines: number): Promise<void> {
    await ipcRenderer.invoke("jusi:resize", columns, lines);
  },
  async runCommand(command: string): Promise<void> {
    await ipcRenderer.invoke("jusi:command", command);
  },
  async focusWindow(windowId: number): Promise<void> {
    await ipcRenderer.invoke("jusi:focus-window", windowId);
  },
  async setCursor(windowId: number, row: number, col: number): Promise<void> {
    await ipcRenderer.invoke("jusi:set-cursor", windowId, row, col);
  },
  async updateWebMirror(bufferId, mirror): Promise<void> {
    await ipcRenderer.invoke("jusi:update-web-mirror", bufferId, mirror);
  },
};

contextBridge.exposeInMainWorld("jusi", api);
