// Executed in the same document world as the text projection. Only mirror
// offsets leave the page; Neovim owns the marks, cursor and jump history.
export function markHintsSource(token: string, letters: string, choice?: string): string {
  return `(() => {
    const token = ${JSON.stringify(token)}, letters = ${JSON.stringify(letters)};
    const choice = ${JSON.stringify(choice ?? null)};
    const id = 'jusi-neovim-mark-hints';
    const old = document.getElementById(id);
    if (choice !== null) {
      if (!old || old.dataset.token !== token) return null;
      const index = old.hintsMap === window.__jusiMirrorIndexMap ? old.targets.get(choice) : null;
      old.dismiss();
      return index ?? null;
    }
    old?.dismiss?.();
    const map = window.__jusiMirrorIndexMap;
    if (!map?.length || !letters.length) return false;
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.setAttribute('aria-hidden','true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const seen = new Set(), regions = new Set(), candidates = [];
    let previous;
    for (let index=0; index<map.length; index++) {
      const entry = map[index], node = entry?.node;
      if (!node?.isConnected || node === previous) continue;
      previous = node;
      const parent = node.parentElement;
      if (!parent) continue;
      const block = parent.closest('td,th,h1,h2,h3,h4,h5,h6') || parent.closest('p,li,pre,button,a,div') || parent;
      if (seen.has(block)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      let left=0, top=0, right=innerWidth, bottom=innerHeight, region=document.body;
      for (let ancestor=parent; ancestor && ancestor!==document.body; ancestor=ancestor.parentElement) {
        const style=getComputedStyle(ancestor);
        if (style.overflowX==='visible' && style.overflowY==='visible') continue;
        const bounds=ancestor.getBoundingClientRect();
        if (style.overflowX!=='visible') { left=Math.max(left,bounds.left); right=Math.min(right,bounds.right); }
        if (style.overflowY!=='visible') { top=Math.max(top,bounds.top); bottom=Math.min(bottom,bounds.bottom); }
        if (region===document.body && ((ancestor.scrollHeight>ancestor.clientHeight+1 && /auto|scroll/.test(style.overflowY))
          || (ancestor.scrollWidth>ancestor.clientWidth+1 && /auto|scroll/.test(style.overflowX)))) region=ancestor;
      }
      for (const rect of range.getClientRects()) {
        const x=Math.max(left,rect.left)+1, y=(Math.max(top,rect.top)+Math.min(bottom,rect.bottom))/2;
        if (rect.bottom<=top || rect.top>=bottom || bottom<=top || x>=Math.min(right,rect.right)) continue;
        const hit = document.elementFromPoint(x,y);
        if (!hit || !(hit===parent || parent.contains(hit))) continue;
        const caret = document.caretRangeFromPoint(x,y);
        if (caret?.startContainer !== node) continue;
        let at = index;
        while (map[at]?.node===node && map[at].offset < caret.startOffset) at++;
        if (map[at]?.node!==node) continue;
        const rank = !regions.has(region) ? 0 : block.matches('th,td,h1,h2,h3,h4,h5,h6') ? 1 : 2;
        candidates.push({at,x,y,rank});
        regions.add(region); seen.add(block); break;
      }
    }
    const chosen = [];
    for (const c of candidates.sort((a,b)=>a.rank-b.rank || a.y-b.y || a.x-b.x)) {
      if (chosen.some(p=>Math.abs(c.x-p.x)<22 && Math.abs(c.y-p.y)<18)) continue;
      chosen.push(c);
      if (chosen.length===letters.length) break;
    }
    if (!chosen.length) return false;
    overlay.dataset.token = token;
    overlay.hintsMap = map;
    overlay.targets = new Map();
    for (const [i,c] of chosen.sort((a,b)=>a.y-b.y || a.x-b.x).entries()) {
      const badge=document.createElement('span');
      badge.textContent=letters[i];
      badge.style.cssText='position:absolute;background:#ffe280;color:#171717;border:1px solid #352800;border-radius:3px;padding:0 3px;font:bold 13px/16px monospace';
      badge.style.left=Math.min(innerWidth-18,c.x)+'px';
      badge.style.top=Math.max(0,Math.min(innerHeight-18,c.y-9))+'px';
      overlay.append(badge); overlay.targets.set(letters[i],c.at);
    }
    const dismiss = () => {
      overlay.remove();
      window.removeEventListener('scroll',dismiss,true);
      window.removeEventListener('resize',dismiss);
    };
    overlay.dismiss = dismiss;
    document.documentElement.append(overlay);
    window.addEventListener('scroll',dismiss,true);
    window.addEventListener('resize',dismiss);
    return letters.slice(0,chosen.length);
  })()`;
}
