/** Ordinary link targets stay current; trusted modified input is routed by main. */
export function browserNavigationSource(): string {
  return `(() => {
    if (window.__jusiNavigationPolicy) return;
    window.__jusiNavigationPolicy = true;
    document.addEventListener('click', event => {
      const link = event.composedPath().find(node => node?.matches?.('a[href], area[href]'));
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download')) return;
      // Ordinary links stay in this document, even with target=_blank or a base target.
      link.target = '_self';
    }, true);
  })()`;
}
