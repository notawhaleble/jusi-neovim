import { EmbeddedNvimSession } from "../bridge/rpc-session.js";
import { PromisedNvimRpcClient } from "../bridge/promised-client.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const client = await PromisedNvimRpcClient.spawn({
    clean: true,
  });

  const session = new EmbeddedNvimSession(client);
  session.start();
  await session.attachUi(120, 40);

  await sleep(200);
  await session.command("enew");
  await session.command("JusiWebBuffer https://example.com");
  await session.command("redraw");
  await sleep(300);

  const snapshot = session.getSnapshot();
  const attached = session.getAttachedWebViews();

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

  await session.dispose();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
