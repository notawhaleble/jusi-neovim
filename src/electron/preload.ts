import { contextBridge, ipcRenderer, webUtils } from "electron";

import { RendererApi, RendererSessionState } from "../renderer/contracts.js";

const api: RendererApi = {
  async getInitialState(): Promise<RendererSessionState> {
    return await ipcRenderer.invoke("jusi:get-initial-state");
  },
  async readBrowserState(windowId, ticket) {
    return await ipcRenderer.invoke("jusi:read-browser-state", windowId, ticket);
  },
  onBrowserRefresh(listener) {
    ipcRenderer.on("jusi:browser-refresh", (_event, value) => listener(value));
  },
  async reportBrowserTextStatus(bufferId, sessionId, guestId, status) {
    await ipcRenderer.invoke("jusi:browser-text-status", bufferId, sessionId, guestId, status);
  },
  onNativePopupControls(listener) {
    ipcRenderer.on("jusi:native-popup-controls", (_event, controls) => listener(controls));
  },
  async acknowledgeNativePopup(token, generation) {
    return await ipcRenderer.invoke("jusi:ack-native-popup", token, generation);
  },
  async retryNativeText(token) {
    return await ipcRenderer.invoke("jusi:retry-native-text", token);
  },
  async closeNativePopup(token) {
    return await ipcRenderer.invoke("jusi:close-native-popup", token);
  },
  async reportNativeViewport(report) {
    return await ipcRenderer.invoke("jusi:native-viewport", report);
  },
  async invalidateNativeViewport() {
    await ipcRenderer.invoke("jusi:invalidate-native-viewport");
  },
  onStateChanged(listener: (state: RendererSessionState) => void): void {
    ipcRenderer.on("jusi:state", (_event: unknown, state: RendererSessionState) => {
      listener(state);
    });
  },
  onBrowserPointer(listener) {
    ipcRenderer.on("jusi:browser-pointer", (_event, pointer) => listener(pointer));
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
  onWebRegion(listener): void {
    ipcRenderer.on("jusi:web-region", (_event: unknown, event) => {
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
  async pasteImage(win, buf) {
    await ipcRenderer.invoke('jusi:paste-image', win, buf);
  },
  async dropFiles(target, files) {
    await ipcRenderer.invoke('jusi:file-drop', target, files.map(file => ({
      path: webUtils.getPathForFile(file), media_type: file.type || 'application/octet-stream',
    })));
  },
  async sendMouse(input) {
    return await ipcRenderer.invoke("jusi:mouse", input);
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
  onBrowserLinkSelected(listener) {
    ipcRenderer.on("jusi:browser-link-selected", (_event, request) => listener(request));
  },
  async openBrowserLink(guestId, token, bufferId, sessionId) {
    return await ipcRenderer.invoke("jusi:open-browser-link", guestId, token, bufferId, sessionId);
  },
  async armBrowserPopup(bufferId: number, sessionId: string, guestId: number) {
    return await ipcRenderer.invoke("jusi:arm-popup", bufferId, sessionId, guestId);
  },
  async runCommand(command: string): Promise<void> {
    await ipcRenderer.invoke("jusi:command", command);
  },
  async resetBrowserInput(guestId) {
    await ipcRenderer.invoke('jusi:reset-browser-input', guestId);
  },
  async setPresentationMode(bufferId, sessionId, windowId, mode) {
    return await ipcRenderer.invoke("jusi:presentation-mode", bufferId, sessionId, windowId, mode);
  },
  async focusWindow(windowId: number): Promise<void> {
    await ipcRenderer.invoke("jusi:focus-window", windowId);
  },
  async setCursor(windowId, row, col, ticket): Promise<void> {
    await ipcRenderer.invoke("jusi:set-cursor", windowId, row, col, ticket);
  },
  async invalidateDocument(bufferId, sessionId, guestId) {
    return await ipcRenderer.invoke("jusi:invalidate-document", bufferId, sessionId, guestId);
  },
  async acquireDocument(bufferId, sessionId, guestId) {
    return await ipcRenderer.invoke("jusi:acquire-document", bufferId, sessionId, guestId);
  },
  async buildWorkerText(ticket) {
    return await ipcRenderer.invoke("jusi:build-worker-text", ticket);
  },
  async updateWebMirror(ticket, mirror) {
    return await ipcRenderer.invoke("jusi:update-web-mirror", ticket, mirror);
  },
  logPerf(event): void {
    ipcRenderer.send("jusi:perf", event);
  },
};

contextBridge.exposeInMainWorld("jusi", api);
