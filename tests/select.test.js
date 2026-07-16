'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');
const { createSandbox, loadScript } = require('./helpers/load');

/* turf無しのbboxフォールバック経路を検証する（CDN前提のturfはNodeに読み込まない） */
function newSelect() {
  const sandbox = createSandbox({ jsyaml });
  loadScript('store.js', sandbox);
  loadScript('select.js', sandbox);
  return sandbox;
}

/* mapview.boundsToGeoJSON と同形の矩形Feature（bbox = [w,s,e,n]） */
function rect(w, s, e, n) {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    bbox: [w, s, e, n]
  };
}

const FEATURES = [
  { id: 'in', type: 'point', tag: 'a', coordinates: [35.5, 139.5] },
  { id: 'out', type: 'point', tag: 'a', coordinates: [40.0, 145.0] },
  { id: 'line-in', type: 'line', tag: 'b', coordinates: [[35.4, 139.4], [35.6, 139.6]] },
  { id: 'line-out', type: 'line', tag: 'b', coordinates: [[41, 146], [42, 147]] }
];

test('selectInBounds: bbox内の点と線を抽出する（turf無しフォールバック）', () => {
  const { Select } = newSelect();
  const ids = Select.selectInBounds(rect(139, 35, 140, 36), FEATURES, {});
  assert.deepEqual(ids.sort(), ['in', 'line-in']);
});

test('selectInBounds: respectHidden で非表示タグを除外する', () => {
  const { Select } = newSelect();
  const ids = Select.selectInBounds(rect(139, 35, 140, 36), FEATURES, {
    respectHidden: true,
    isHidden: f => f.tag === 'a'
  });
  assert.deepEqual(ids, ['line-in']);
});

test('selectInBounds: respectHidden=false なら非表示でも対象になる', () => {
  const { Select } = newSelect();
  const ids = Select.selectInBounds(rect(139, 35, 140, 36), FEATURES, {
    respectHidden: false,
    isHidden: () => true
  });
  assert.deepEqual(ids.sort(), ['in', 'line-in']);
});

test('selectInBounds: polygon もフォールバックで抽出できる（頂点がbbox内）', () => {
  const { Select } = newSelect();
  const polys = [
    { id: 'poly-in', type: 'polygon', tag: 'c', coordinates: [[[35.4, 139.4], [35.6, 139.4], [35.6, 139.6]]] },
    { id: 'poly-out', type: 'polygon', tag: 'c', coordinates: [[[41, 146], [42, 146], [42, 147]]] }
  ];
  const ids = Select.selectInBounds(rect(139, 35, 140, 36), polys, {});
  assert.deepEqual(ids, ['poly-in']);
});

test('selectInBounds: 既知の制限 — 両端点がbbox外で横切る線はフォールバックでは取れない', () => {
  const { Select } = newSelect();
  // 線分は矩形を横断するが、頂点はどちらもbbox外（turfがあれば intersect で拾える）
  const crossing = [{ id: 'cross', type: 'line', tag: 'c', coordinates: [[35.5, 138.5], [35.5, 140.5]] }];
  const ids = Select.selectInBounds(rect(139, 35, 140, 36), crossing, {});
  assert.deepEqual(ids, [], 'この挙動を変える場合はこのテストを更新する');
});

test('measure: turf不在では空オブジェクトを返す', () => {
  const { Select } = newSelect();
  assert.deepEqual(Select.measure({ id: 'l', type: 'line', coordinates: [[35, 139], [36, 140]] }), {});
});
