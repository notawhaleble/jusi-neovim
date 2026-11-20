import assert from 'node:assert/strict';
import { BrowserWindow, webContents } from 'electron';
import { writeFileSync } from 'node:fs';

// Opt-in real-site diagnosis, using the existing isolated-profile desktop harness.
export async function browserPopupStabilityCases({waitFor}) {
  const host = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.isVisible()));
  const js = code => host.webContents.executeJavaScript(code);
  const command = value => js(`window.jusi.runCommand(${JSON.stringify(value)})`);
  await waitFor(() => js('!!window.jusi'));
  await command(`JusiWebBuffer ${process.env.JUSI_TEST_POPUP_SITE}`);
  const source = await waitFor(() => webContents.getAllWebContents().find(w => w.getURL() === process.env.JUSI_TEST_POPUP_SITE));
  await waitFor(() => source.executeJavaScript(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Play')`));
  await command('JusiWebAllowPopup');
  await source.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Play').click()`, true);
  const child = await waitFor(() => webContents.getAllWebContents().find(w => w !== source && w.getURL().includes('autostart=1')));
  const view = await waitFor(() => host.contentView.children.find(v => v.webContents?.id === child.id));
  const events=[];
  const visible=view.setVisible.bind(view);
  view.setVisible=value=>{events.push({event:'visible',value,time:Date.now()});return visible(value);};
  for(const event of ['focus','blur','did-start-navigation','dom-ready']) child.on(event,()=>events.push({event,time:Date.now()}));
  await waitFor(()=>view.getVisible());
  child.focus();
  await new Promise(resolve=>setTimeout(resolve,4000));
  const observedHides=events.filter(e=>e.event==='visible'&&!e.value).length;
  writeFileSync('.local/review/play-popup-events.json',JSON.stringify(events,null,2));
  console.log('Popup observation',JSON.stringify({events:events.length,hidden:events.filter(e=>e.event==='visible'&&!e.value).length,navigation:events.filter(e=>e.event==='did-start-navigation').length}));
  if (process.env.JUSI_TEST_REVIEW === 'popup-stability') {
    console.log('Manual review ready: game popup; check gameplay, editor escape/re-entry, then Ctrl-Q.');
    for (let n=0;n<600 && !child.isDestroyed();n++) await new Promise(resolve=>setTimeout(resolve,200));
  } else {
    child.sendInputEvent({type:'keyDown',keyCode:'Q',modifiers:['control']});
    child.sendInputEvent({type:'keyUp',keyCode:'Q',modifiers:['control']});
  }
  await waitFor(()=>child.isDestroyed());
  // Manual review can intentionally change layout after this bounded observation.
  assert.ok(observedHides < 10, 'Idle rich popup repeatedly hides');
}
