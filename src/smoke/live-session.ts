import assert from "node:assert/strict";
import { EmbeddedNvimSession } from "../bridge/rpc-session.js";
import { EmbeddedNvimRpcClient } from "../bridge/nvim-client.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const client = await EmbeddedNvimRpcClient.spawn({
    clean: true,
  });

  const session = new EmbeddedNvimSession(client);
  try {
  session.start();
  await session.attachUi(120, 40);

  await sleep(200);
  await session.command("enew");
  await session.command("JusiWebBuffer https://example.com");
  await session.command("redraw");
  await sleep(300);

  const snapshot = session.getSnapshot();
  const attached = session.getAttachedWebViews();

  assert.equal(attached.length, 1);
  assert.equal(attached[0].url, "https://example.com");
  assert.equal(attached[0].providerId, "web");
  assert.ok(attached[0].gridBounds, "Explicit window/grid ownership must resolve");

  const originalTab = snapshot.currentTabId!;
  const originalSession = attached[0].sessionId;
  const closedTabs: number[] = [];
  client.onNotification(notification => {
    const event = notification.args[0] as { type?: string; tabId?: number };
    if (notification.method === "jusi:layout" && event?.type === "tab-close") closedTabs.push(event.tabId!);
  });
  const verifyTabs = async () => {
    const expected = await client.request("nvim_exec_lua", [
      "return {tabs=vim.api.nvim_list_tabpages(),windows=vim.api.nvim_list_wins(),current=vim.api.nvim_get_current_tabpage()}", [],
    ]) as { tabs: number[]; windows: number[]; current: number };
    const sorted = (ids: number[]) => ids.slice().sort((a,b) => a-b);
    for (let attempt = 0; attempt < 50; attempt++) {
      const actual = session.getSnapshot();
      if (JSON.stringify(sorted(actual.tabs.map(tab => tab.id))) === JSON.stringify(sorted(expected.tabs))
        && JSON.stringify(sorted(actual.windows.map(window => window.id))) === JSON.stringify(sorted(expected.windows))
        && actual.currentTabId === expected.current) return;
      await sleep(20);
    }
    assert.deepEqual(sorted(session.getSnapshot().tabs.map(tab => tab.id)), sorted(expected.tabs));
    assert.deepEqual(sorted(session.getSnapshot().windows.map(window => window.id)), sorted(expected.windows));
    assert.equal(session.getSnapshot().currentTabId, expected.current);
  };
  for (const command of ["tabnew", "tabnew", "tabprevious", "tabclose", "tabnew", "tabmove 0"]) {
    await session.command(command);
    await verifyTabs();
  }
  const closingHandle = session.getSnapshot().currentTabId!;
  assert.notEqual(closingHandle, 1, "closed tab number 1 must differ from its stable handle");
  await session.command("tabclose");
  await verifyTabs();
  assert.ok(closedTabs.includes(closingHandle), "runtime reports the actual removed handle");
  assert.ok(session.getSnapshot().tabs.some(tab => tab.id === originalTab), "surviving tab number is not mistaken for the removed handle");
  await client.request("nvim_set_current_tabpage", [originalTab]);
  await session.command("tabonly");
  await verifyTabs();
  assert.equal(session.getAttachedWebViews()[0]?.sessionId, originalSession, "provider survives reorder and unrelated close");
  await session.command("tabnew | tabclose");
  await verifyTabs();
  console.log("Live Neovim reordered/nonconsecutive tab handles and provider survival passed");

  console.log(
    JSON.stringify(
      {
        currentTabId: snapshot.currentTabId,
        bufferCount: snapshot.buffers.length,
        windowCount: snapshot.windows.length,
        attachedWebViews: attached.map((view) => ({
          bufferId: view.bufferId,
          windowId: view.windowId,
          url: view.url,
          hasBounds: view.gridBounds !== undefined,
          bounds: view.gridBounds,
        })),
      },
      null,
      2,
    ),
  );

  } finally {
    await session.dispose();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
