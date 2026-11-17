import type { NativeOwnerIdentity } from './native-child-owner.js';

/** Main-process committed URL observation shared by DOM and native adapters. */
export function observeBrowserLocation(contents: any, identity: () => NativeOwnerIdentity | undefined,
  publish: (identity: NativeOwnerIdentity, url: string) => Promise<void>, report: (error: unknown) => void): () => void {
  const update = () => {
    const owner = identity();
    if (!owner || contents.isDestroyed()) return;
    const url = contents.getURL();
    if (url) void publish(owner, url).catch(report);
  };
  contents.on('did-navigate', update);
  contents.on('did-navigate-in-page', (_event: unknown, _url: string, mainFrame: boolean) => { if (mainFrame) update(); });
  // Binding can happen after the first navigation; caller publishes once bound.
  return update;
}
