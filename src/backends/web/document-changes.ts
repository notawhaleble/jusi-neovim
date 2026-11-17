// Runs in the untrusted document. Returns only a bounded change counter, never IPC.
export function documentChangesSource(): string {
  return `(() => {
    if (!window.__jusiDocumentChanges) {
      const state = { revision: 0 };
      let quietTimer, batchTimer, dirty = false;
      const owned = node => {
        const element = node.nodeType === 1 ? node : node.parentElement;
        return !!element?.closest?.('#jusi-neovim-mirror-overlay, #jusi-neovim-web-mode-frame, #jusi-neovim-pointer-visibility');
      };
      const excluded = node => {
        const element = node.nodeType === 1 ? node : node.parentElement;
        return !!element?.closest?.('script, style, noscript, template, input, textarea, select, [contenteditable]:not([contenteditable="false"])');
      };
      const hasText = node => !owned(node) && !excluded(node) && /\\S/.test(node.textContent || '');
      const flush = () => {
        clearTimeout(quietTimer); clearTimeout(batchTimer);
        batchTimer = undefined; dirty = false;
        state.revision = (state.revision + 1) % Number.MAX_SAFE_INTEGER;
      };
      const changed = () => {
        window.__jusiTextJobId = (window.__jusiTextJobId || 0) + 1;
        window.__jusiMirrorIndexMap = [];
        document.getElementById('jusi-neovim-mirror-overlay')?.remove();
        if (!dirty) { dirty = true; batchTimer = setTimeout(flush, 1500); }
        clearTimeout(quietTimer); quietTimer = setTimeout(flush, 400);
      };
      const styleSignature = element => {
        const s = getComputedStyle(element);
        return [s.display,s.visibility,s.whiteSpace,s.textTransform,s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing,s.width,s.position,s.clip,s.clipPath,s.contentVisibility].join('|');
      };
      const observer = new MutationObserver(records => {
        if (records.some(record => {
          if (owned(record.target) || excluded(record.target)) return false;
          if (record.type === 'childList') return [...record.addedNodes, ...record.removedNodes].some(hasText);
          if (record.type === 'characterData') return true;
          if (!hasText(record.target)) return false;
          if (record.attributeName === 'style' || record.attributeName === 'class') {
            const prior = window.__jusiTextStyles?.get(record.target);
            const next = styleSignature(record.target);
            window.__jusiTextStyles?.set(record.target, next);
            // Color, transforms and media progress don't change mirrored text.
            return prior === undefined || prior !== next;
          }
          return true;
        })) changed();
      });
      observer.observe(document, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['class','style','hidden','aria-hidden','open'] });
      window.addEventListener('resize', changed);
      document.fonts?.addEventListener('loadingdone', changed);
      window.__jusiDocumentChanges = state;
    }
    return window.__jusiDocumentChanges.revision;
  })()`;
}
