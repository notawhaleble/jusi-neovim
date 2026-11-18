import assert from 'node:assert/strict';
import { resolveNativeChildPlacement as resolve, NativePlacementGate } from '../../dist/electron/native-child-placement.js';
const binding = { bufferId: 2, sessionId: 'child', incarnation: 1, token: 'token' };
const source = { id: 10, bufferId: 1, tabId: 1, gridBounds: { gridId: 2, row: 0, col: 0, width: 100, height: 10, zIndex: 0, compIndex: 0 } };
const owner = { id: 11, bufferId: 2, tabId: 1, gridId: 3, row: 10, col: 0, width: 100, height: 24,
 gridBounds: { gridId: 3, row: 10, col: 0, width: 100, height: 24, zIndex: 0, compIndex: 1 } };
const base = { binding, session: { ...binding, nativeChild: 'token', attachedWindowId: 11 },
 snapshot: { currentTabId: 1, windows: [source, owner] }, generation: 1, trustedUiVisible: false,
 viewport: { x: 0, y: 0, width: 1000, height: 700, cellWidth: 10, cellHeight: 20, zoom: 1 } };
assert.deepEqual(resolve(base).bounds, { x: 0, y: 200, width: 1000, height: 480 });
for (const change of [ { trustedUiVisible: true }, { session: { ...base.session, incarnation: 2 } },
 { viewport: { ...base.viewport, width: 100 } }, { viewport: { ...base.viewport, zoom: NaN } },
 { snapshot: { ...base.snapshot, currentTabId: 2 } },
 { snapshot: { ...base.snapshot, windows: [source, owner, { ...owner, id: 12 }] } },
 { snapshot: { ...base.snapshot, windows: [source, { ...owner, gridId: 9 }] } },
 { snapshot: { ...base.snapshot, windows: [source, owner, { id: 12, tabId: 1, bufferId: 4 }] } },
 { snapshot: { ...base.snapshot, windows: [source, owner, { ...source, id: 12, gridBounds: { ...source.gridBounds, height: 35, zIndex: 100 } }] } }]) assert.equal(resolve({ ...base, ...change }), null);
assert.deepEqual(resolve({ ...base, viewport: { ...base.viewport, zoom: 0.5 } }).bounds,
 { x: 0, y: 100, width: 500, height: 240 });
let visible = true, bounds;
const gate = new NativePlacementGate({ setVisible(v) { visible = v; }, setBounds(b) { bounds = b; } });
gate.invalidate(); assert.equal(visible, false);
assert.equal(gate.apply(resolve(base)), true); assert.equal(visible, true);
gate.invalidate(); assert.equal(gate.apply(resolve(base)), false); assert.equal(visible, false);
assert.equal(gate.apply(null), false); assert.ok(bounds);
console.log('native child placement and stale generation tests passed');

// A hidden Neovim float can return with win_float_pos and no new grid_resize.
const { NvimRedrawTranslator } = await import('../../dist/bridge/redraw-translator.js');
const translator = new NvimRedrawTranslator();
translator.translate([{ name: 'grid_resize', args: [5, 64, 20] }]);
assert.equal(translator.translate([{ name: 'win_hide', args: [5] }])[0].type, 'grid-close');
const position = { name: 'win_float_pos', args: [5, 11, 'NW', 1, 4, 9, true, 50, 0, 4, 9] };
assert.equal(translator.translate([position])[0].bounds.width, 64);
translator.translate([{ name: 'grid_destroy', args: [5] }]);
assert.equal(translator.translate([position])[0].bounds.width, 0);

// Eight-field float events on 0.11.4 refer to the anchor grid's corner.
const split = { name: 'win_pos', args: [4, 12, 2, 40, 39, 20] };
const float = { name: 'win_float_pos', args: [5, 11, 'SE', 4, 6.8, 10.5, true, 50, 0] };
const nested = { name: 'win_float_pos', args: [6, 13, 'NW', 5, 1, 2, true, 60, 0] };
const coords = events => events.filter(e => e.type === 'grid-bounds').map(({ bounds: b }) => [b.gridId, b.row, b.col]);
const anchored = new NvimRedrawTranslator();
assert.deepEqual(anchored.translate([{ name: 'grid_resize', args: [5,10,5] }, float]), []);
assert.deepEqual(coords(anchored.translate([split])), [[5,3,40],[4,2,40]]);
assert.deepEqual(coords(anchored.translate([{ name: 'grid_resize', args: [6,8,2] },nested])), [[6,4,42]]);
assert.deepEqual(coords(anchored.translate([{ ...split, args: [4,12,3,30,49,20] }])), [[5,4,30],[4,3,30],[6,5,32]]);
assert.deepEqual(anchored.translate([{ name: 'win_hide', args:[4] }]).map(e=>e.gridId), [4,5,6]);
assert.deepEqual(coords(anchored.translate([split])), [[5,3,40],[6,4,42],[4,2,40]]);
anchored.translate([{ name: 'grid_destroy', args: [4] }]);
assert.deepEqual(coords(anchored.translate([split])), [[4,2,40]], 'reused split grid cannot revive old floats');
