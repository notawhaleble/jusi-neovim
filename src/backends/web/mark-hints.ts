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
    // Synthetic spaces and line breaks have no map entry. Keep each text
    // node's mapped indices in offset order so wrapped lines remain jumpable.
    const nodes = new Map();
    for (let i=0; i<map.length; i++) {
      const node=map[i]?.node;
      if (!node) continue;
      if (!nodes.has(node)) nodes.set(node, []);
      nodes.get(node).push(i);
    }
    const candidates = [];
    const gapX = Math.max(32, Math.min(140, innerWidth/7));
    const gapY = Math.max(22, Math.min(90, innerHeight/6));
    const range = document.createRange();
    for (const [node, indices] of nodes) {
      const parent = node.parentElement;
      if (!parent || !node.isConnected) continue;
      range.selectNodeContents(node);
      const bounds = range.getBoundingClientRect();
      if (bounds.bottom<=0 || bounds.top>=innerHeight || bounds.right<=0 || bounds.left>=innerWidth) continue;
      const landmark = !!parent.closest('td,th,h1,h2,h3,h4,h5,h6');
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
        const start=Math.max(left,rect.left)+1, end=Math.min(right,rect.right);
        const y=(Math.max(top,rect.top)+Math.min(bottom,rect.bottom))/2;
        if (rect.bottom<=top || rect.top>=bottom || bottom<=top || start>=end) continue;
        for (let x=start; x<end; x+=gapX) {
          const hit=document.elementFromPoint(x,y);
          if (!hit || !parent.contains(hit)) continue;
          const caret=document.caretRangeFromPoint(x,y);
          if (caret?.startContainer!==node) continue;
          let lo=0, hi=indices.length;
          while (lo<hi) {
            const mid=(lo+hi)>>>1;
            if (map[indices[mid]].offset<caret.startOffset) lo=mid+1;
            else hi=mid;
          }
          if (lo===indices.length) continue;
          // A caret in collapsed whitespace can point past this visible line.
          // Anchor the badge to the actual mapped character.
          const at=indices[lo], offset=map[at].offset;
          range.setStart(node,offset);
          range.setEnd(node,offset+1);
          const char=range.getBoundingClientRect();
          if (char.bottom<=y || char.top>y || char.right<=left || char.left>=right || char.width<=0) continue;
          const anchorX=Math.max(left,char.left);
          if (Math.abs(anchorX-x)>gapX/2) continue;
          candidates.push({at,x:anchorX,y,region,landmark,nearest:Infinity});
        }
      }
    }
    // Each successive label fills the largest remaining gap. Give a modest
    // preference to landmarks and scroll regions that have no label yet.
    candidates.sort((a,b)=>a.y-b.y || a.x-b.x);
    const chosen = [], regions = new Set();
    let next=candidates[0];
    while (next && chosen.length<letters.length) {
      chosen.push(next);
      regions.add(next.region);
      let best, bestScore=0;
      for (const c of candidates) {
        const distance=((c.x-next.x)/gapX)**2 + ((c.y-next.y)/gapY)**2;
        c.nearest=Math.min(c.nearest,distance);
        if (c.nearest<0.6) continue;
        const score=c.nearest * (regions.has(c.region) ? 1 : 1.4) * (c.landmark ? 1.1 : 1);
        if (score>bestScore) { best=c; bestScore=score; }
      }
      next=best;
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
