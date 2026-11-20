import assert from 'node:assert/strict';
import { PopupPermit, popupUrlAllowed } from '../../dist/electron/popup-policy.js';
let now = 100;
const permit = new PopupPermit(() => now);
assert.equal(permit.take('https://site.test'),false);
permit.arm(); assert.equal(permit.take('https://site.test'),true);
assert.equal(permit.take('https://site.test'),false);
permit.arm(); now += 15000; assert.equal(permit.take('https://site.test'),false);
permit.arm(); permit.reset(); assert.equal(permit.take('https://site.test'),false);
for(const url of ['file:///etc/passwd','javascript:alert(1)','data:text/html,test','jusi-directory://open/','mailto:a@example.test']) {
  assert.equal(popupUrlAllowed(url),false);
  permit.arm(); assert.equal(permit.take(url),false);
  assert.equal(permit.take('https://site.test'),false);
}
assert.equal(popupUrlAllowed('about:blank'),true);
permit.arm(true);
now += 20000;
assert.equal(permit.take('https://site.test', false),false);
assert.equal(permit.take('file:///etc/passwd', true),false);
assert.equal(permit.take('https://site.test', true),true);
assert.equal(permit.take('about:blank', true),true);
permit.reset();
assert.equal(permit.take('https://site.test', true),false);
permit.arm(true); permit.arm();
assert.equal(permit.take('https://site.test'),true);
assert.equal(permit.take('https://site.test', true),false);
console.log('popup policy tests passed');
