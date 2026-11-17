/** Chromium's trusted click carries current modifiers even when Electron's
 * before-mouse-event omits them. This world has no Node/IPC or shell bridge.
 * Main pulls one bounded result after a native press/release, never on page demand.
 */
export const browserClickWorld = 1001;
export const installBrowserClicks = `(() => {
  if (globalThis.__jusiBrowserClicks) return;
  const queue = [], waiters = [];
  const matches = (a,b) => a.button===b.button && b.time>=a.since && Math.abs(a.x-b.x)<2 && Math.abs(a.y-b.y)<2;
  const publish = value => {
    const index=waiters.findIndex(w=>matches(w.point,value));
    if(index>=0) { const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(value); }
    else { queue.push(value); if(queue.length>8)queue.shift(); }
  };
  let intercepted;
  const target = event => {
    if (!event.isTrusted || ![0,1].includes(event.button)) return null;
    if (!(event.button===1 || event.ctrlKey || event.metaKey || event.shiftKey)) return null;
    const link=event.composedPath().find(node=>node instanceof Element && node.matches('a[href],area[href]'));
    if(link && typeof link.href==='string' && link.href.length<=32768 && !link.hasAttribute('download')) {
      try { const parsed=new URL(link.href);if(['http:','https:'].includes(parsed.protocol))return parsed.href; } catch {}
    }
    return null;
  };
  const suppress = event => { event.preventDefault();event.stopImmediatePropagation(); };
  addEventListener('mousedown',event=>{
    if(!event.isTrusted)return;
    const url=target(event);
    intercepted=url ? {url,button:event.button,time:Date.now()} : undefined;
    if(intercepted)suppress(event);
  },true);
  addEventListener('mouseup',event=>{
    if(!event.isTrusted || ![0,1].includes(event.button))return;
    const url=target(event);
    const matched=intercepted && intercepted.button===event.button && intercepted.url===url;
    if(matched){intercepted.time=Date.now();suppress(event);}else intercepted=undefined;
    publish({x:event.clientX,y:event.clientY,button:event.button,time:Date.now(),url:matched?url:null,
      control:event.ctrlKey,meta:event.metaKey,shift:event.shiftKey});
  },true);
  for(const name of ['click','auxclick','contextmenu'])addEventListener(name,event=>{
    // macOS Control-left produces contextmenu instead of click. Preserve the
    // host's explicit Control-link convention using this same trusted press.
    if(event.isTrusted && intercepted && Date.now()-intercepted.time<1000) {
      suppress(event);
      if(name!=='contextmenu')intercepted=undefined;
    }
  },true);
  addEventListener('blur',()=>{
    intercepted=undefined;queue.length=0;
    for(const waiter of waiters.splice(0)){clearTimeout(waiter.timer);waiter.resolve(null);}
  },true);
  globalThis.__jusiBrowserClicks = point => {
    while(queue.length && Date.now()-queue[0].time>1000)queue.shift();
    const index=queue.findIndex(value=>matches(point,value));
    if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);
    if(waiters.length>=8)return Promise.resolve(null);
    return new Promise(resolve=>{
      const entry={point,resolve,timer:setTimeout(()=>{const i=waiters.indexOf(entry);if(i>=0)waiters.splice(i,1);resolve(null);},250)};
      waiters.push(entry);
    });
  };
})()`;
export function takeBrowserClick(x: number, y: number, button: string, since: number): string {
  return `globalThis.__jusiBrowserClicks?.(${JSON.stringify({x,y,button:button==='middle'?1:0,since})}) ?? null`;
}
