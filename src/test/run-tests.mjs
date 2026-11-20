// Run modules sequentially: top-level async lifecycle tests must not overlap CPU-heavy fixtures.
await import('./text-mapping.test.mjs');
await import("./web-buffer-registry.test.mjs");
await import("./web-url-normalizer.test.mjs");
await import("./overlay-state.test.mjs");
await import("./screen-state.test.mjs");
await import("./compositor.test.mjs");
await import("./key-routing.test.mjs");
await import("./rpc-session.test.mjs");
await import("./spawn-config.test.mjs");
await import("./presentation.test.mjs");
await import("./document-revisions.test.mjs");
await import("./msgpack-rpc.test.mjs");
await import("./sandbox-evidence.test.mjs");
await import("./backend.test.mjs");

await import("./renderer-surface.test.mjs");

await import("./worker-document.test.mjs");

await import("./document-changes.test.mjs");

await import("./browser-profiles.test.mjs");

await import("./popup-policy.test.mjs");
await import("./native-child-owner.test.mjs");

await import("./native-child-placement.test.mjs");

await import("./native-viewport.test.mjs");

await import("./native-popup-text.test.mjs");

await import("./browser-document.test.mjs");

await import('./browser-mode-keys.test.mjs');

await import('./browser-commands.test.mjs');
await import("./browser-clipboard.test.mjs");

await import('./extraction-limits.test.mjs');

await import("./nvim-frame.test.mjs");

await import("./nvim-mouse.test.mjs");

await import("./overlay-text.test.mjs");

await import('./highlight.test.mjs');

await import('./prompt-highlight.test.mjs');

await import('./ui-options.test.mjs');

await import("./cursor.test.mjs");

await import('./browser-location.test.mjs');

await import("./browser-input-boundary.test.mjs");
await import("./browser-clicks.test.mjs");

await import("./browser-fullscreen.test.mjs");

await import('./browser-trace.test.mjs');
