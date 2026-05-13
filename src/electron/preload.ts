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
  onWebOpenLink(listener): void {
    ipcRenderer.on("jusi:web-open-link", (_event: unknown, event) => {
      listener(event);
    });
  },
  onWebEnterMode(listener): void {
    ipcRenderer.on("jusi:web-enter-mode", (_event: unknown, event) => {
      listener(event);
    });
  },
  onLeaveWebMode(listener): void {
    ipcRenderer.on("jusi:leave-web-mode", () => {
      listener();
    });
  },
  onAppZoom(listener): void {
    ipcRenderer.on("jusi:app-zoom", (_event: unknown, event) => {
      listener(event);
    });
  },
  onWebZoomed(listener): void {
    ipcRenderer.on("jusi:web-zoomed", () => {
      listener();
    });
  },
  onWebOpenActiveLink(listener): void {
    ipcRenderer.on("jusi:web-open-active-link", () => {
      listener();
    });
  },
  async sendInput(keys: string): Promise<void> {
    await ipcRenderer.invoke("jusi:input", keys);
  },
  async sendWindowInput(keys: string): Promise<void> {
    await ipcRenderer.invoke("jusi:window-input", keys);
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
