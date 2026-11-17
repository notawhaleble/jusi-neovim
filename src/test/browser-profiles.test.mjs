import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MediaPermissions } from '../../dist/electron/media-permissions.js';
import { BrowserProfiles } from '../../dist/electron/browser-profiles.js';
let answer;
const permissions = new MediaPermissions(() => new Promise(resolve => { answer = resolve; }));
const contents = new EventEmitter();
contents.getURL = () => 'https://site.test/page';
contents.isDestroyed = () => false;
const details = {requestingUrl: 'https://site.test/page', mediaTypes: ['audio'], isMainFrame: true};
let pending = permissions.request(contents, 'media', details);
answer(true);
assert.equal(await pending, true);
assert.equal(permissions.check(contents, 'media', 'https://site.test', {mediaType: 'audio'}), true);
assert.equal(permissions.check(contents, 'media', 'https://other.test', {mediaType: 'audio'}), false);
assert.equal(permissions.check(contents, 'media', 'https://site.test', {mediaType: 'video'}), false);
assert.deepEqual(permissions.list(), ['https://site.test: audio']);
permissions.revoke();
pending = permissions.request(contents, 'media', details);
permissions.revoke(); answer(true);
assert.equal(await pending, false, 'revocation supersedes open prompt');
pending = permissions.request(contents, 'media', details);
contents.emit('did-start-navigation', {}, 'https://elsewhere.test', false, true);
answer(true); assert.equal(await pending, false, 'navigation away/back supersedes prompt');
assert.equal(contents.listenerCount('did-start-navigation'), 0);
assert.equal(await permissions.request(contents, 'media', {...details,isMainFrame:false}), false);
assert.equal(await permissions.request(contents, 'media', {...details,mediaTypes:['display']}), false);
assert.equal(await permissions.request(contents, 'media', {...details,requestingUrl:'http://site.test'}), false);
let active = false, fail = false, calls = [], confirm;
const session = {
  clearData: async () => { calls.push('data'); if(fail) throw Error('fixture disk failure'); },
  clearAuthCache: async () => calls.push('auth'),
  closeAllConnections: async () => calls.push('connections'),
};
const manager = new BrowserProfiles(() => session, () => permissions, () => active,
  () => new Promise(resolve => {confirm = resolve;}));
await assert.rejects(manager.run('../bad', 'clear'), /Invalid/);
active = true;
await assert.rejects(manager.run('work', 'clear'), /Close all/);
assert.deepEqual(calls, []);
active = false;
pending = manager.run('work','clear');
assert.equal(manager.isBusy('work'), true);
await assert.rejects(manager.run('work','clear'), /in progress/);
confirm(false); assert.match(await pending, /cancelled/); assert.deepEqual(calls, []);
pending = manager.run('work','clear'); active = true; confirm(true);
await assert.rejects(pending, /active page/);
active = false;
pending = manager.run('work','clear'); confirm(true); assert.match(await pending, /data cleared/);
assert.deepEqual(calls, ['data','auth','connections']);
fail = true; pending = manager.run('work','clear'); confirm(true);
await assert.rejects(pending, /partially cleared/); assert.equal(manager.isBusy('work'),false);
pending = manager.run('work','revoke'); confirm(true); assert.match(await pending,/grants revoked/);
assert.match(await manager.run('work','permissions'), /None/);
console.log('browser profile management and media grant tests passed');
