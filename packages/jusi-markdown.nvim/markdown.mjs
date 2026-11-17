import MarkdownIt from 'markdown-it';
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
const escape = md.utils.escapeHtml;
// Documents cannot load resources or supply scripts. Only deliberate web links remain.
md.renderer.rules.image = (tokens, i) => `<span class="image-alt">[Image: ${escape(tokens[i].content)}]</span>`;
md.renderer.rules.link_open = (tokens, i, options, env, renderer) => {
  const token = tokens[i];
  if (!/^https?:\/\//i.test(token.attrGet('href') ?? '')) token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'href');
  token.attrSet('rel', 'noreferrer');
  return renderer.renderToken(tokens, i, options);
};
for (const type of ['fence', 'code_block']) {
  const render = md.renderer.rules[type];
  md.renderer.rules[type] = (tokens, i, ...args) => `<div${md.renderer.renderAttrs(tokens[i])}>${render(tokens, i, ...args)}</div>`;
}
function parse(source) {
  // Keep ranges in the original UTF-8 source, including CRLF byte lengths.
  const offsets = [0];
  for (const line of source.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []) offsets.push(offsets.at(-1) + Buffer.byteLength(line));
  const tokens = md.parse(source, {});
  const parents = [];
  for (const token of tokens) {
    if (token.type === "paragraph_open" || token.type === "paragraph_close") token.hidden = false;
    if (token.nesting === -1) parents.pop();
    if (!token.map) {
      if (token.type === "inline") token.anchor = parents.at(-1);
      if (token.nesting === 1) parents.push(parents.at(-1));
      continue;
    }
    token.anchor = { source: 'markdown', startByte: offsets[token.map[0]] ?? Buffer.byteLength(source), endByte: offsets[token.map[1]] ?? Buffer.byteLength(source) };
    if (token.nesting === 1) parents.push(token.anchor);
    if (token.nesting >= 0 && token.type !== 'inline') {
      token.attrSet('data-start', String(token.anchor.startByte));
      token.attrSet('data-end', String(token.anchor.endByte));
    }
  }
  return tokens;
}
export function render(source) { return md.renderer.render(parse(source), md.options, {}); }
function plain(tokens) {
  return (tokens ?? []).map(t => t.type === 'image' ? `[Image: ${t.content}]`
    : ['softbreak','hardbreak'].includes(t.type) ? '\n'
    : ['text','code_inline'].includes(t.type) ? t.content : t.children ? plain(t.children) : '').join('');
}
export function extract(source) {
  const lines = [];
  for (const token of parse(source)) {
    if (!token.anchor || !['inline','fence','code_block'].includes(token.type)) continue;
    const content = token.type === 'inline' ? plain(token.children) : token.content.replace(/\n$/, '');
    for (const text of content.split('\n')) lines.push({ text, anchor: token.anchor });
  }
  if (lines.length > 10000 || lines.reduce((n,l) => n + Buffer.byteLength(l.text),0) > 524288) throw new Error('Markdown text exceeds the host text budget');
  const document = { offsetEncoding: 'utf-8', lines };
  if (Buffer.byteLength(JSON.stringify(document)) > 900000) throw new Error('Markdown anchors exceed the host transport budget');
  return document;
}
