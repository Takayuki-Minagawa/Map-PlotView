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

const near = (actual, expected, relTol, msg) =>
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relTol, `${msg}: ${actual} ≈ ${expected}`);

test('distance / pathLength: 大円距離（turf.length と同じ平均半径）', () => {
  const { Select } = newSelect();
  const oneDegree = 2 * Math.PI * 6371008.8 / 360; // 子午線方向の緯度1度
  near(Select.distance([35, 139], [36, 139]), oneDegree, 1e-9, '緯度1度');
  near(Select.pathLength([[0, 0], [1, 0], [2, 0]]), 2 * oneDegree, 1e-9, '折れ線の合計');
  assert.equal(Select.pathLength([[35, 139]]), 0, '1点は0');
  // 閉じる指定では終点→始点の辺も足す（面の周長）
  near(Select.pathLength([[0, 0], [1, 0], [1, 1]], true),
    Select.pathLength([[0, 0], [1, 0], [1, 1], [0, 0]]), 1e-12, '周長');
});

test('ringArea / polygonArea: 球面上の面積（向き・閉じ方によらない、穴は差し引く）', () => {
  const { Select } = newSelect();
  const R = 6371008.8, rad = Math.PI / 180; // turf 7 の area と同じ平均半径
  // 経線と緯線で囲まれた矩形の厳密な面積 R²·Δλ·(sinφ2 − sinφ1)
  const exact = R * R * (1 * rad) * (Math.sin(36 * rad) - Math.sin(35 * rad));
  const ring = [[35, 139], [35, 140], [36, 140], [36, 139]];
  near(Select.ringArea(ring), exact, 1e-9, '開いたリング');
  near(Select.ringArea(ring.slice().reverse()), exact, 1e-9, '逆回り');
  near(Select.ringArea(ring.concat([ring[0]])), exact, 1e-9, '閉じたリング');
  assert.equal(Select.ringArea([[35, 139], [36, 140]]), 0, '2点は0');
  const hole = [[35.25, 139.25], [35.25, 139.75], [35.75, 139.75], [35.75, 139.25]];
  near(Select.polygonArea([ring, hole]), exact - Select.ringArea(hole), 1e-9, '穴あり');
});

test('measure: 線は長さ(km)、面は面積(m²)と周長(m)', () => {
  const { Select } = newSelect();
  const line = Select.measure({ id: 'l', type: 'line', coordinates: [[35, 139], [36, 139]] });
  near(line.length, 2 * Math.PI * 6371.0088 / 360, 1e-9, '長さkm');
  const ring = [[35, 139], [35, 140], [36, 140]];
  const poly = Select.measure({ id: 'g', type: 'polygon', coordinates: [ring] });
  near(poly.area, Select.ringArea(ring), 1e-12, '面積');
  near(poly.perimeter, Select.pathLength(ring, true), 1e-12, '周長');
  assert.deepEqual(Select.measure({ id: 'p', type: 'point', coordinates: [35, 139] }), {});
});
