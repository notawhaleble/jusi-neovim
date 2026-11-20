import assert from 'node:assert/strict';
import { BrowserWindow, webContents } from 'electron';
import { createServer } from 'node:http';
import { cpus, totalmem } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';

/** Production DOM adapter, automatic extraction and Neovim publication; no guest host API. */
export async function alphaTimingCases({waitFor}) {
  const report={date:new Date().toISOString(),machine:{cpu:cpus()[0]?.model,memory:totalmem(),platform:process.platform,
    arch:process.arch,electron:process.versions.electron,chromium:process.versions.chrome},adapter:'webview',trials:[]};
  const save=()=>{mkdirSync('.local/review',{recursive:true});writeFileSync(`.local/review/alpha-timing-${process.env.JUSI_TEST_ALPHA_CASE||'all'}.json`,JSON.stringify(report,null,2)+'\n');};
  const pages=new Map();
  const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pages.get(req.url)||'<!doctype html><input>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const host=await waitFor(()=>BrowserWindow.getAllWindows().find(window => window.isVisible()));
  const js=code=>host.webContents.executeJavaScript(code);
  const command=value=>js(`window.jusi.runCommand(${JSON.stringify(value)})`);
  const ready=()=>js(`document.querySelector('.web-view-box:not(.web-view-box--parked) .presentation-text-status')?.dataset.status`);
  const percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1]:null;
  try {
    await waitFor(()=>js('!!window.jusi').catch(()=>false));
    await command(`JusiWebBuffer ${origin}/`);
    const guest=await waitFor(()=>webContents.getAllWebContents().find(c=>c.getType()==='webview'&&c.getURL()===origin+'/'));
    await waitFor(async()=>await ready()==='ready');
    await js(`(() => {
      if(!PerformanceObserver.supportedEntryTypes.includes('longtask')) throw Error('Long task observation unavailable');
      window.alphaProbe=null;
      window.jusi.onStateChanged(state=>{
        const probe=window.alphaProbe;if(!probe)return;
        for(const view of state.attachedWebViews){
          const first=view.mirror?.lines[0]?.text || '';
          const marker=first.split(' ')[0];
          if(probe.targets.includes(marker)&&!probe.publications.some(p=>p.marker===marker))
            probe.publications.push({marker,at:Date.now(),revision:view.mirror.version});
        }
      });
      window.alphaLongTasks=new PerformanceObserver(list=>{
        if(window.alphaProbe) for(const entry of list.getEntries())
          if(entry.startTime>=alphaProbe.start)alphaProbe.longTasks.push({start:entry.startTime,duration:entry.duration});
      });
      alphaLongTasks.observe({type:'longtask'});
    })()`);
    const kinds=['words','wrapped','unicode','mutation','navigation'];
    const only=process.env.JUSI_TEST_ALPHA_CASE;
    if(only) assert.ok(kinds.includes(only),'unknown alpha timing case');
    for(const kind of kinds.filter(kind=>!only||kind===only)) {
      for(let trial=0;trial<(['mutation','navigation'].includes(kind)?1:3);trial++) {
        const marker=`ALPHA_${kind}_${trial}`, replacement=`ALPHA_recovered_${kind}`;
        const unit=kind==='words'?'word ':kind==='unicode'?'A😀é文אב ':'a';
        const text=marker+' '+unit.repeat(Math.floor((200000-marker.length-1)/unit.length));
        const route=`/${kind}-${trial}`;
        pages.set(route,`<!doctype html><style>p{width:800px;font:16px monospace;overflow-wrap:anywhere}</style><input autofocus><p>${text}</p><script>
          window.alphaKeys=[];document.querySelector('input').addEventListener('keydown',()=>alphaKeys.push(Date.now()));
        </script>`);
        pages.set('/replacement',`<!doctype html><input><p>${replacement}</p>`);
        await js(`(() => {
          window.alphaProbe={targets:${JSON.stringify([marker,replacement])},start:performance.now(),publications:[],gaps:[],longTasks:[]};
          let last=performance.now();alphaProbe.timer=setInterval(()=>{const now=performance.now();alphaProbe.gaps.push(now-last);last=now},10);
        })()`);
        const start=Date.now(),sent=[],mainGaps=[];let last=performance.now(),inputTimer;
        const mainTimer=setInterval(()=>{const now=performance.now();mainGaps.push(now-last);last=now},10);
        let probe,data;
        try {
          await guest.loadURL(origin+route);
          await waitFor(async()=>await ready()==='building');
          if(kind==='mutation') await guest.executeJavaScript(`document.querySelector('p').textContent=${JSON.stringify(replacement)}`);
          else if(kind==='navigation') await guest.loadURL(origin+'/replacement');
          else {
            await command('normal i');
            await waitFor(()=>guest.executeJavaScript('document.hasFocus()'));
            await guest.executeJavaScript(`document.querySelector('input').focus()`);
            inputTimer=setInterval(()=>{sent.push(Date.now());guest.sendInputEvent({type:'keyDown',keyCode:'q'});guest.sendInputEvent({type:'char',keyCode:'q'});guest.sendInputEvent({type:'keyUp',keyCode:'q'});},25);
          }
          const expected=['mutation','navigation'].includes(kind)?replacement:marker;
          await waitFor(()=>js(`alphaProbe.publications.some(p=>p.marker===${JSON.stringify(expected)})`));
          await waitFor(async()=>await ready()==='ready');
          clearInterval(inputTimer);clearInterval(mainTimer);
          probe=await js(`(() => {clearInterval(alphaProbe.timer);alphaProbe.longTasks.push(...alphaLongTasks.takeRecords().filter(e=>e.startTime>=alphaProbe.start).map(e=>({start:e.startTime,duration:e.duration})));return alphaProbe})()`);
          data=await guest.executeJavaScript(`({keys:window.alphaKeys||[],value:document.querySelector('input').value,
            paint:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,timeOrigin:performance.timeOrigin})`);
          // Independently verify the committed Neovim text, outside measured intervals.
          await command(`lua assert(vim.api.nvim_buf_get_lines(0,0,1,false)[1]:find('${expected}',1,true))`);
          const mirrored=await js(`(async()=>{const s=await window.jusi.getInitialState();const view=s.attachedWebViews.find(v=>v.mirror?.lines[0]?.text.startsWith(${JSON.stringify(expected)}));return view?.mirror.lines.map(l=>l.text).join('')})()`);
          assert.equal(mirrored.replace(/\s/g,''),(['mutation','navigation'].includes(kind)?replacement:text).replace(/\s/g,''),'published text preserves non-whitespace units');
          const published=probe.publications.find(p=>p.marker===expected).at;
          const inputs=data.keys.flatMap((at,i)=>at<=published&&sent[i]!==undefined?[at-sent[i]]:[]);
          const entry={kind,trial,sourceUnits:text.length,publicationObservedMs:published-start,
            richPaintMs:data.paint===undefined?null:data.timeOrigin+data.paint-start,
            hostLongTasks:probe.longTasks,hostTimerGapMaxMs:Math.max(0,...probe.gaps),mainTimerGapMaxMs:Math.max(0,...mainGaps),
            inputSamples:inputs.length,inputP95Ms:percentile(inputs,.95),inputMaxMs:inputs.length?Math.max(...inputs):null,
            publications:probe.publications};
          report.trials.push(entry);save();console.log('Alpha timing',JSON.stringify(entry));
          if(['mutation','navigation'].includes(kind)) assert.ok(!probe.publications.some(p=>p.marker===marker),'superseded text must not publish');
          else {assert.ok(inputs.length>0,'input must reach the guest before publication');assert.ok(data.value.length>0);assert.ok(entry.richPaintMs!==null&&entry.richPaintMs<entry.publicationObservedMs,'rich paint precedes text publication');}
        } catch(error) {
          const failure={kind,trial,error:String(error),status:await ready(),
            shell:await js(`({probe:alphaProbe,status:document.querySelector('.presentation-text-status')?.textContent})`),
            guest:await guest.executeJavaScript(`({focused:document.hasFocus(),mapLength:window.__jusiMirrorIndexMap?.length,job:window.__jusiTextJobId})`).catch(()=>null)};
          report.failure=failure;save();console.error('Alpha timing failure',JSON.stringify({kind,trial,error:failure.error,status:failure.status,guest:failure.guest,publications:failure.shell.probe?.publications}));throw error;
        } finally {
          clearInterval(inputTimer);clearInterval(mainTimer);
          await js(`if(window.alphaProbe){clearInterval(alphaProbe.timer);window.alphaProbe=null}`).catch(()=>{});
        }
      }
    }
    report.hostStallGatePassed=report.trials.every(t=>t.hostLongTasks.every(task=>task.duration<=50));save();
    // Record misses for diagnosis; measurement completion alone does not accept A1.
    console.log('Alpha host long-task gate:',report.hostStallGatePassed?'passed in these trials':'NOT met');
  } finally {save();host.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
