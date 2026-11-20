import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { allowClipboardWrite } from '../../dist/electron/browser-clipboard.js';

const url = 'https://example.test/repository';
const request = { isMainFrame: true, requestingUrl: url };
function focusedDocument() {
  return Object.assign(new EventEmitter(), {
    mainFrame: { url },
    isFocused: () => true,
    isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: async (world, scripts, userGesture) => {
      assert.ok(world > 0);
      assert.equal(userGesture, false);
      return true;
    },
  });
}
assert.equal(await allowClipboardWrite(focusedDocument(), request), true);
for (const details of [{ ...request, isMainFrame: false }, { ...request, requestingUrl: 'https://other.test' }]) {
  assert.equal(await allowClipboardWrite(focusedDocument(), details), false);
}
for (const change of [
  contents => contents.emit('blur'),
  contents => contents.emit('did-start-navigation', {isMainFrame:true, isSameDocument:false}),
  contents => { contents.mainFrame = { url }; },
  contents => { contents.isDestroyed = () => true; },
]) {
  const contents = focusedDocument();
  const pending = allowClipboardWrite(contents, request);
  change(contents);
  assert.equal(await pending, false);
  assert.deepEqual(contents.eventNames(), []);
}
console.log('Clipboard write frame, origin, navigation, focus and teardown checks passed');
