import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('real worker, immutable source, extraction, navigation, endpoint isolation and shutdown', async () => {
 const dir=await mkdtemp(join(tmpdir(),'markdown-test-'));
 const path=join(dir,'quoted " file; name.md');
 await writeFile(path,'# Hello\n\nUnicode é 文 😀\n');
 const child=spawn(process.execPath,[new URL('../viewer.mjs',import.meta.url).pathname,path],{stdio:['pipe','pipe','pipe']});
 const frames=[], waiters=[];
 const lines=createInterface({input:child.stdout});
 lines.on('line',line=>{frames.push(JSON.parse(line)); waiters.shift()?.();});
 const next=async()=>{if(!frames.length)await Promise.race([new Promise(r=>waiters.push(r)),new Promise((_,r)=>setTimeout(()=>r(Error('frame timeout')),4000).unref())]);return frames.shift();};
 const send=f=>child.stdin.write(JSON.stringify(f)+'\n');
 try {
  send({type:'hello',version:1});const ready=await next();assert.equal(ready.type,'ready');
  const response=await fetch(ready.surface.url);const html=await response.text();
  assert.match(html,/<h1[^>]*>Hello/); assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
  assert.equal((await fetch(ready.surface.url+'../secret')).status,404);
  assert.equal((await fetch(ready.surface.url,{method:'POST'})).status,405);
  await writeFile(path,'# Changed');
  const ticket={bufferId:1,incarnation:1,sessionId:'test',revision:1};
  send({type:'extract',id:1,ticket});const result=await next();assert.equal(result.document.lines[0].text,'Hello');
  const anchor=result.document.lines[1].anchor;
  send({type:'navigate',sequence:1,ticket,windowId:1000,anchor});
  let state;for(let i=0;i<50;i++){state=await fetch(ready.surface.url+'state').then(r=>r.json());if(state.sequence===1)break;await new Promise(r=>setTimeout(r,10));}
  assert.deepEqual(state.selected,anchor);
  send({type:'navigate',sequence:2,ticket:{...ticket,revision:0},anchor:null});
  send({type:'navigate',sequence:1,ticket,anchor:null});
  await new Promise(r=>setTimeout(r,30));assert.deepEqual((await fetch(ready.surface.url+'state').then(r=>r.json())).selected,anchor);
  const exit=once(child,'exit');send({type:'shutdown'});assert.equal((await exit)[0],0);
 } finally {child.kill();lines.close();await rm(dir,{recursive:true,force:true});}
});
test('missing and invalid UTF-8 files fail startup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'markdown-bad-'));
 try {await writeFile(join(dir,'bad.md'),Buffer.from([255]));for(const file of ['missing.md','bad.md']){
  const child=spawn(process.execPath,[new URL('../viewer.mjs',import.meta.url).pathname,join(dir,file)],{stdio:'ignore'});
  assert.notEqual((await once(child,'exit'))[0],0);
 }}finally{await rm(dir,{recursive:true,force:true});}
});
