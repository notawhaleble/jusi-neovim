import { exitBrowserFullscreenForHost } from './browser-fullscreen.js';
import { traceBrowser } from './browser-trace.js';
import type { BrowserWindow } from "electron";
import { isPhysicalKeyInput } from "./key-routing.js";

export function isFullscreenToggleInput(input: { type?: string; key?: string; code?: string; control?: boolean; meta?: boolean }): boolean {
  if (input.type !== "keyDown") {
    return false;
  }
  const key = String(input.key ?? "");
  return key === "F11" || (input.control === true && input.meta === true && isPhysicalKeyInput(input, "KeyF"));
}

export function toggleFullscreen(win: BrowserWindow, isAutoRepeat = false): void {
  if (isAutoRepeat || exitBrowserFullscreenForHost(win)) return;
  const fullscreenWindow = win as unknown as {
    isFullScreen?: () => boolean;
    setFullScreen?: (fullscreen: boolean) => void;
  };
  traceBrowser('fullscreen.host-toggle', {window:win.id,wasFullscreen:fullscreenWindow.isFullScreen?.()});
  fullscreenWindow.setFullScreen?.(!(fullscreenWindow.isFullScreen?.() ?? false));
}

