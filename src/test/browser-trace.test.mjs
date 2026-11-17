import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BrowserTrace,browserTraceMark,browserTraceEnabled,traceBrowserKey} from '../../dist/electron/browser-trace.js';
const root=mkdtempSync(join(tmpdir(),'jusi-trace-'));
try {
  assert.equal(browserTraceEnabled(),false);
  assert.equal(await browserTraceMark({}),undefined);
  const trace=new BrowserTrace(root,1024,4);
  const secret='https://user:password@private.test/secret?q=token#private';
  const token=trace.url(secret);
  assert.equal(token,trace.url(secret));
  assert.notEqual(token,trace.url(secret+'2'));
  const other=new BrowserTrace(root);assert.notEqual(token,other.url(secret));
  for (let i=0;i<10;i++) trace.record('click',{url:token,i});
  await trace.flush();
  let raw=readdirSync(trace.directory).map(n=>readFileSync(join(trace.directory,n),'utf8')).join('');
  assert(raw.includes('trace.dropped'));assert(!raw.includes('private'));assert(!raw.includes('password'));
  for(let i=0;i<30;i++) {trace.record('rotate',{i,value:'x'.repeat(300)});await trace.flush();}
  const files=readdirSync(trace.directory);
  assert.equal(files.length,3);
  for(const file of files){const path=join(trace.directory,file);assert(statSync(path).size<=1024);assert.equal(statSync(path).mode&0o777,0o600);}
  trace.record('final.marker');await Promise.all([trace.flush(),trace.flush()]);
  raw=files.map(n=>readFileSync(join(trace.directory,n),'utf8')).join('');assert(raw.includes('final.marker'));
  const broken=new BrowserTrace(root);rmSync(broken.directory,{recursive:true});
  broken.record('will-fail');await broken.flush();assert.equal(broken.healthy,false);
  broken.record('ignored');await broken.flush();
  assert.equal(traceBrowserKey({key:'password',code:'KeyP'}),'other');
  assert.equal(traceBrowserKey({key:'Meta'}),'Meta');
} finally {rmSync(root,{recursive:true,force:true});}
console.log('Browser trace rotation, bounds, privacy, flush and write-failure isolation passed');
