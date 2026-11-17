import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, extract } from '../markdown.mjs';
test('rich Markdown and source anchored readable text', () => {
  const source = '# Café 文 😀\r\n\r\nA **bold** and *italic* [link](https://example.com).\r\n\r\n- One\r\n- Two\r\n\r\n> Quote\r\n\r\n```js\r\nconst x = 1;\r\n```\r\n\r\n| A | B |\r\n| - | - |\r\n| x | y |\r\n';
  const html = render(source), doc = extract(source);
  for (const tag of ['h1','strong','em','ul','blockquote','pre','table']) assert.match(html,new RegExp(`<${tag}[ >]`));
  assert.deepEqual(doc.lines.map(l=>l.text),['Café 文 😀','A bold and italic link.','One','Two','Quote','const x = 1;','A','B','x','y']);
  for (const line of doc.lines) {
    const {startByte,endByte}=line.anchor;
    assert.ok(endByte > startByte && endByte <= Buffer.byteLength(source));
    assert.ok(html.includes(`data-start="${startByte}" data-end="${endByte}"`));
  }
  assert.equal(Buffer.from(source).subarray(0,doc.lines[0].anchor.endByte).toString(),'# Café 文 😀\r\n');
});
test('document HTML, resources and dangerous links stay inert', () => {
  const html=render('<script>globalThis.pwned=1</script>\n\n![secret](file:///etc/passwd)\n\n[x](javascript:alert(1)) [local](../secret) [web](https://example.com)');
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:')); assert.ok(!html.includes('href="../'));
  assert.match(html,/href="https:\/\/example.com"/);
  assert.match(extract('![caption](anything)').lines[0].text,/caption/);
});
test('empty, CR-only, nested content and extraction caps', () => {
  assert.deepEqual(extract('').lines,[]);
  assert.equal(extract('# One\r\rTwo').lines[1].anchor.startByte,7);
  assert.ok(render('> - nested\n').includes('nested'));
  assert.throws(()=>extract('x'.repeat(524289)),/budget/);
});
