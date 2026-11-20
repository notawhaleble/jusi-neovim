import type { PermissionRequest, WebContents } from "electron";

// Permission queries never grant standing clipboard access. Chromium asks about
// each write; inspect its current top-level document in an isolated JS world.
export async function allowClipboardWrite(contents: WebContents, details: PermissionRequest): Promise<boolean> {
  if (!details.isMainFrame || contents.isDestroyed() || !contents.isFocused()) return false;
  let invalidated = false;
  const invalidate = () => { invalidated = true; };
  const onNavigation = (event: {isMainFrame: boolean; isSameDocument: boolean}) => {
    if (event.isMainFrame && !event.isSameDocument) invalidate();
  };
  contents.on('did-start-navigation', onNavigation);
  contents.on('blur', invalidate);
  try {
    const frame = contents.mainFrame;
    const url = new URL(frame.url);
    if (!['https:', 'http:'].includes(url.protocol) || new URL(details.requestingUrl).origin !== url.origin) return false;
    const active = await contents.executeJavaScriptInIsolatedWorld(1002, [{
      code: "window.isSecureContext && document.visibilityState === 'visible' && document.hasFocus() && navigator.userActivation.isActive",
    }], false);
    return active === true && !invalidated && !contents.isDestroyed() && contents.isFocused() &&
      contents.mainFrame === frame && frame.url === url.href;
  } catch {
    return false;
  } finally {
    contents.removeListener('did-start-navigation', onNavigation);
    contents.removeListener('blur', invalidate);
  }
}
