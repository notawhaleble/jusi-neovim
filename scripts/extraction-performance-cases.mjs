import assert from 'node:assert/strict';
import { BrowserWindow } from 'electron';
import { cpus, totalmem } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mirrorExtractorSource } from '../dist/backends/web/document-scripts.js';
import { documentChangesSource } from '../dist/backends/web/document-changes.js';

/** Isolated engine benchmark: production extraction, test-only timing instrumentation. */
export async function extractionPerformanceCases({app}) {
  const label=(process.env.JUSI_TEST_PERF_LABEL || 'latest').replace(/[^a-zA-Z0-9_-]/g,'_');
  const path=`.local/review/extraction-performance-${label}.json`;
  const report={collectedAt:new Date().toISOString(),machine:{platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,
    memoryBytes:totalmem(),electron:process.versions.electron,chromium:process.versions.chrome},
    scope:'Isolated sandboxed Chromium guest; excludes Neovim publication and host renderer UI',cases:[]};
  const save=()=>{mkdirSync('.local/review',{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');};
  const percentile=(values,p)=>values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1] : null;
  const win=new BrowserWindow({width:1000,height:700,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const guest=win.webContents;
  const source=mirrorExtractorSource()
    .replace('const normalized = await', "window.perfPhase='normalization'; const normalized = await")
    .replace('const tokens = tokenize', "window.perfPhase='tokenization'; const tokens = tokenize")
    .replace('if (tokens.length)', "window.perfPhase='geometry'; if (tokens.length)")
    .replace('if (performance.now() - sliceStart < 8) return;', 'if (performance.now() - sliceStart < 8) return; window.perfSlices.push(performance.now()-sliceStart);')
    .replace('window.__jusiMirrorIndexMap = indexMap;', 'window.perfSlices.push(performance.now()-sliceStart); window.__jusiMirrorIndexMap = indexMap;');
  assert.ok(source.includes('window.perfSlices.push(performance.now()-sliceStart); window.__jusiMirrorIndexMap'), 'final-slice instrumentation');
  assert.ok(source.includes('return; window.perfSlices.push'), 'yield instrumentation');
  try {
    for(const kind of (process.env.JUSI_TEST_PERF_CASE==='unicode' ? ['unicode'] : ['words','single-nowrap','single-wrap','mutation'])) {
      const text=kind==='unicode' ? 'A😀é文אב '.repeat(22222) : kind==='words' ? 'word '.repeat(39999)+'words' : 'a'.repeat(200000);
      const html=`<!doctype html><style>p{font:16px monospace;width:800px;${kind==='single-nowrap'?'white-space:pre':'overflow-wrap:anywhere'}}</style><input autofocus><p>${text}</p>`;
      await guest.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
      win.focus();guest.focus();
      await guest.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await guest.executeJavaScript(documentChangesSource());
      await guest.executeJavaScript(`(() => {
        document.querySelector('input').focus();window.perfSlices=[];window.perfKeys=[];window.perfGaps=[];
        window.perfPhase='start';window.perfPhaseTime={};window.perfMirror=undefined;window.perfEnd=undefined;window.perfActive=true;window.perfStart=performance.now();let last=performance.now();
        window.perfTimer=setInterval(()=>{const now=performance.now();perfGaps.push(now-last);perfPhaseTime[perfPhase]=(perfPhaseTime[perfPhase]||0)+(now-last);last=now},10);
        document.querySelector('input').addEventListener('keydown',()=>perfKeys.push({at:Date.now(),active:perfActive}));
        ${kind==='mutation'?"setTimeout(()=>document.querySelector('p').textContent='Changed during extraction',25);":''}
      })()`);
      const sent=[],mainGaps=[];let last=performance.now();
      const mainTimer=setInterval(()=>{const now=performance.now();mainGaps.push(now-last);last=now},10);
      const inputTimer=setInterval(()=>{sent.push(Date.now());guest.sendInputEvent({type:'keyDown',keyCode:'q'});guest.sendInputEvent({type:'char',keyCode:'q'});guest.sendInputEvent({type:'keyUp',keyCode:'q'});},25);
      let result;
      try {
        result=await guest.executeJavaScript(`(async()=>{try {const mirror=await ${source};
          window.perfEnd=performance.now();window.perfActive=false;window.perfMirror=mirror;clearInterval(perfTimer);
          return {characters:mirror.lines?.reduce((sum,line)=>sum+line.text.length,0),lines:mirror.lines?.length,limited:mirror.limitExceeded===true};}catch(error){return {error:error.message}}finally{window.perfActive=false;window.perfEnd ??= performance.now()}})()`);
      } finally {clearInterval(inputTimer);clearInterval(mainTimer);}
      const data=await guest.executeJavaScript(`(() => {clearInterval(perfTimer);return {elapsedMs:perfEnd-perfStart,slices:perfSlices,keys:perfKeys,gaps:perfGaps,mapLength:window.__jusiMirrorIndexMap.length,phaseTime:perfPhaseTime,paint:performance.getEntriesByName('first-contentful-paint')[0]?.startTime}})()`);
      // Geometry assertions run after all extraction clocks and probes stop.
      await guest.executeJavaScript(`(() => {const mirror=window.perfMirror;
          if (${JSON.stringify(kind)} === 'single-wrap') {
            for(const line of mirror.lines || []) {
              const first=window.__jusiMirrorIndexMap[line.startIndex],last=window.__jusiMirrorIndexMap[line.endIndex-1];
              const range=document.createRange();range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset+1);
              const rects=Array.from(range.getClientRects());
              if(rects.some(r=>Math.abs(r.top-rects[0].top)>1)) throw Error('Mirror line crosses visual lines');
            }
          }
        delete window.perfMirror;
      })()`);
      const inputLatencies=data.keys.flatMap((key,index)=>key.active && sent[index]!==undefined ? [key.at-sent[index]] : []);
      const entry={kind,...result,phaseTime:data.phaseTime,elapsedMs:data.elapsedMs,firstContentfulPaintMs:data.paint,
        sliceCount:data.slices.length,sliceP95Ms:percentile(data.slices,.95),sliceMaxMs:Math.max(0,...data.slices),
        inputSamples:inputLatencies.length,inputP95Ms:percentile(inputLatencies,.95),inputMaxMs:inputLatencies.length?Math.max(...inputLatencies):null,
        guestTimerSamples:data.gaps.length,guestTimerGapMaxMs:data.gaps.length?Math.max(...data.gaps):null,
        mainTimerSamples:mainGaps.length,mainTimerGapMaxMs:mainGaps.length?Math.max(...mainGaps):null};
      report.cases.push(entry);save();console.log('Extraction benchmark',JSON.stringify(entry));
      if(kind==='mutation') {
        assert.match(result.error,/changed|superseded/i);assert.equal(data.mapLength,0);
        const recovery=await guest.executeJavaScript(mirrorExtractorSource());
        assert.equal(recovery.lines.map(line=>line.text).join(''),'Changed during extraction');
      }
      else {if(kind!=='single-nowrap') assert.ok(inputLatencies.length>0,'input must arrive during extraction');assert.equal(result.error,undefined);assert.equal(result.limited,false);assert.ok(result.characters>=160000);}
    }
  } finally {save();win.destroy();}
  console.log(`Extraction performance artifact: ${path}`);
}
