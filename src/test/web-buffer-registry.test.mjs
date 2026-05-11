import assert from "node:assert/strict";

import { NeovimUiAdapter } from "../../dist/core/neovim-ui-adapter.js";
import { NeovimUiState } from "../../dist/core/neovim-ui-state.js";
import { WebBufferRegistry } from "../../dist/core/web-buffer-registry.js";

function buildHarness() {
  const uiState = new NeovimUiState();
  const registry = new WebBufferRegistry();
  const adapter = new NeovimUiAdapter(uiState, registry);

  registry.registerSession({
    bufferId: 10,
    url: "https://example.com",
  });

  adapter.apply({ type: "buffer", bufferId: 10, kind: "web", name: "web://example" });

  return { adapter, registry };
}

function testAttachesWebBufferOnlyInActiveTab() {
  const { adapter, registry } = buildHarness();

  adapter.apply({ type: "tab", tabId: 1, currentWindowId: 100 });
  adapter.apply({ type: "tab", tabId: 2, currentWindowId: 200 });
  adapter.apply({ type: "window", windowId: 100, tabId: 1, bufferId: 10 });
  adapter.apply({ type: "window", windowId: 200, tabId: 2, bufferId: 10 });

  adapter.apply({ type: "current-tab", tabId: 1 });
  assert.equal(registry.getSession(10)?.attachedWindowId, 100);
  assert.equal(registry.getSession(10)?.lastKnownTabId, 1);

  adapter.apply({ type: "current-tab", tabId: 2 });
  assert.equal(registry.getSession(10)?.attachedWindowId, 200);
  assert.equal(registry.getSession(10)?.lastKnownTabId, 2);
}

function testDetachesWhenBufferIsNotVisibleInCurrentTab() {
  const { adapter, registry } = buildHarness();

  adapter.apply({ type: "tab", tabId: 1, currentWindowId: 101 });
  adapter.apply({ type: "tab", tabId: 2, currentWindowId: 202 });
  adapter.apply({ type: "window", windowId: 101, tabId: 1, bufferId: 10 });
  adapter.apply({ type: "window", windowId: 202, tabId: 2, bufferId: 99 });

  adapter.apply({ type: "buffer", bufferId: 99, kind: "text", name: "notes" });
  adapter.apply({ type: "current-tab", tabId: 1 });
  assert.equal(registry.getSession(10)?.attachedWindowId, 101);

  adapter.apply({ type: "current-tab", tabId: 2 });
  assert.equal(registry.getSession(10)?.attachedWindowId, null);
  assert.equal(registry.getSession(10)?.lastKnownTabId, 1);
}

function testPrefersExistingVisibleWindowWhenWindowListRefreshes() {
  const { adapter, registry } = buildHarness();

  adapter.apply({ type: "tab", tabId: 1, currentWindowId: 100 });
  adapter.apply({ type: "window", windowId: 100, tabId: 1, bufferId: 10 });
  adapter.apply({ type: "window", windowId: 101, tabId: 1, bufferId: 10 });
  adapter.apply({ type: "current-tab", tabId: 1 });
  assert.equal(registry.getSession(10)?.attachedWindowId, 100);

  adapter.apply({ type: "window", windowId: 100, tabId: 1, bufferId: 10 });
  adapter.apply({ type: "window", windowId: 101, tabId: 1, bufferId: 10 });
  assert.equal(registry.getSession(10)?.attachedWindowId, 100);
}

testAttachesWebBufferOnlyInActiveTab();
testDetachesWhenBufferIsNotVisibleInCurrentTab();
testPrefersExistingVisibleWindowWhenWindowListRefreshes();

console.log("web-buffer-registry tests passed");
