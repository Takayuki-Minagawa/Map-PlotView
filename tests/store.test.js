'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');
const { createSandbox, loadScript } = require('./helpers/load');

function newStore() {
  const sandbox = createSandbox({ jsyaml });
  loadScript('store.js', sandbox);
  return sandbox.Store;
}

test('validateFeature: 正常な point/line/polygon を許可する', () => {
  const Store = newStore();
  assert.equal(Store.validateFeature({ id: 'p1', type: 'point', coordinates: [35.6, 139.7] }).ok, true);
  assert.equal(Store.validateFeature({ id: 'l1', type: 'line', coordinates: [[35, 139], [36, 140]] }).ok, true);
  assert.equal(Store.validateFeature({
    id: 'g1', type: 'polygon', coordinates: [[[35, 139], [36, 139], [36, 140]]]
  }).ok, true);
});

test('validateFeature: 不正な入力を拒否する', () => {
  const Store = newStore();
  assert.equal(Store.validateFeature(null).ok, false);
  assert.equal(Store.validateFeature({ type: 'point', coordinates: [35, 139] }).ok, false, 'id欠落');
  assert.equal(Store.validateFeature({ id: 'x', type: 'circle', coordinates: [] }).ok, false, '未知type');
  assert.equal(Store.validateFeature({ id: 'x', type: 'point', coordinates: [91, 139] }).ok, false, '緯度範囲外');
  assert.equal(Store.validateFeature({ id: 'x', type: 'point', coordinates: [35, 181] }).ok, false, '経度範囲外');
  assert.equal(Store.validateFeature({ id: 'x', type: 'line', coordinates: [[35, 139]] }).ok, false, 'line頂点不足');
  assert.equal(Store.validateFeature({ id: 'x', type: 'polygon', coordinates: [[[35, 139], [36, 139]]] }).ok, false, 'リング頂点不足');
});

test('validateFeature: 境界値と型を厳密に扱う', () => {
  const Store = newStore();
  assert.equal(Store.validateFeature({ id: 'x', type: 'point', coordinates: [90, 180] }).ok, true, '境界値は有効');
  assert.equal(Store.validateFeature({ id: 'x', type: 'point', coordinates: [-90, -180] }).ok, true);
  assert.equal(Store.validateFeature({ id: 'x', type: 'point', coordinates: ['35', '139'] }).ok, false, '文字列座標は拒否');
});

test('parseYaml: 正常なドキュメントを読み込む', () => {
  const Store = newStore();
  const doc = Store.parseYaml([
    'version: 2',
    'view: { center: [35, 139], zoom: 10 }',
    'tags:',
    '  - { id: site, name: Site, color: "#2e7d32" }',
    'features:',
    '  - { id: f1, type: point, tag: site, coordinates: [35.1, 139.1] }'
  ].join('\n'));
  assert.equal(doc.features.length, 1);
  assert.equal(doc.tags.length, 1);
  assert.equal(doc.warnings.length, 0);
  assert.deepEqual(doc.view.center, [35, 139]);
});

test('parseYaml: 未定義タグは未分類へ変更し警告を出す', () => {
  const Store = newStore();
  const doc = Store.parseYaml([
    'features:',
    '  - { id: f1, type: point, tag: nosuch, coordinates: [35, 139] }'
  ].join('\n'));
  assert.equal(doc.features[0].tag, '__uncategorized__');
  assert.equal(doc.warnings.length, 1);
  assert.ok(doc.tags.some(t => t.id === '__uncategorized__'), '未分類タグが自動追加される');
});

test('parseYaml: タグ未指定のフィーチャは警告なしで未分類になる', () => {
  const Store = newStore();
  const doc = Store.parseYaml([
    'features:',
    '  - { id: f1, type: point, coordinates: [35, 139] }'
  ].join('\n'));
  assert.equal(doc.features[0].tag, '__uncategorized__');
  assert.equal(doc.warnings.length, 0);
  assert.ok(doc.tags.some(t => t.id === '__uncategorized__'));
});

test('parseYaml: 不正フィーチャはスキップして警告を出す', () => {
  const Store = newStore();
  const doc = Store.parseYaml([
    'features:',
    '  - { id: bad, type: point, coordinates: [999, 139] }',
    '  - { id: ok, type: point, coordinates: [35, 139] }'
  ].join('\n'));
  assert.equal(doc.features.length, 1);
  assert.equal(doc.features[0].id, 'ok');
  assert.equal(doc.warnings.length, 1);
});

test('parseYaml: 構文エラー・空ドキュメントはthrowする', () => {
  const Store = newStore();
  assert.throws(() => Store.parseYaml('{{{invalid'));
  assert.throws(() => Store.parseYaml(''));
  assert.throws(() => Store.parseYaml('just a string'));
});

test('dumpYaml → parseYaml のラウンドトリップ', () => {
  const Store = newStore();
  const tags = new Map([['site', { id: 'site', name: 'Site', color: '#123456' }]]);
  const features = new Map([['f1', { id: 'f1', type: 'point', tag: 'site', name: 'A', coordinates: [35.5, 139.5] }]]);
  const text = Store.dumpYaml({ meta: { photoBase: 'photos' }, view: Store.DEFAULT_VIEW, tags, features });
  const doc = Store.parseYaml(text);
  assert.equal(doc.features.length, 1);
  assert.deepEqual(doc.features[0].coordinates, [35.5, 139.5]);
  assert.equal(doc.tags[0].id, 'site');
  assert.equal(doc.meta.photoBase, 'photos');
});

test('toGeoJSON: 緯度経度の並び替えとリングの閉合', () => {
  const Store = newStore();
  const pt = Store.toGeoJSON({ id: 'p', type: 'point', tag: 't', coordinates: [35, 139] });
  assert.deepEqual(pt.geometry.coordinates, [139, 35], 'GeoJSONは[lng,lat]');

  const poly = Store.toGeoJSON({
    id: 'g', type: 'polygon', tag: 't',
    coordinates: [[[35, 139], [36, 139], [36, 140]]]
  });
  const ring = poly.geometry.coordinates[0];
  assert.equal(ring.length, 4, 'リングが閉じられる');
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test('fromGeoJSON: toGeoJSONとの往復で内部表現へ戻る', () => {
  const Store = newStore();
  const orig = {
    id: 'g1', type: 'polygon', tag: 'site', name: 'Area',
    coordinates: [[[35, 139], [36, 139], [36, 140]]],
    properties: { memo: 'x' }
  };
  const back = Store.fromGeoJSON(Store.toGeoJSON(orig));
  assert.equal(back.id, 'g1');
  assert.equal(back.type, 'polygon');
  assert.equal(back.tag, 'site');
  assert.equal(back.name, 'Area');
  assert.deepEqual(back.coordinates, orig.coordinates, '閉じたリングが開いたリングへ戻る');
  assert.deepEqual(back.properties, { memo: 'x' }, '内部キーはpropertiesから除外');
});

test('toGeoJSON: 既に閉じたリングを二重に閉じない', () => {
  const Store = newStore();
  const poly = Store.toGeoJSON({
    id: 'g', type: 'polygon', tag: 't',
    coordinates: [[[35, 139], [36, 139], [36, 140], [35, 139]]]
  });
  assert.equal(poly.geometry.coordinates[0].length, 4);
});

test('fromGeoJSON: properties 無しの Feature でも安全に変換する', () => {
  const Store = newStore();
  const f = Store.fromGeoJSON({
    type: 'Feature', id: 'p9',
    geometry: { type: 'Point', coordinates: [139, 35] }
  });
  assert.equal(f.id, 'p9');
  assert.equal(f.type, 'point');
  assert.deepEqual(f.coordinates, [35, 139]);
});

test('fromGeoJSON: line の座標往復', () => {
  const Store = newStore();
  const orig = { id: 'l1', type: 'line', tag: 't', coordinates: [[35, 139], [36, 140]] };
  const back = Store.fromGeoJSON(Store.toGeoJSON(orig));
  assert.equal(back.type, 'line');
  assert.deepEqual(back.coordinates, orig.coordinates);
});

test('mapToArray: Map/配列/オブジェクト/null を配列化する', () => {
  const Store = newStore();
  assert.deepEqual(Store.mapToArray(new Map([['a', 1]])), [1]);
  assert.deepEqual(Store.mapToArray([1, 2]), [1, 2]);
  assert.deepEqual(Store.mapToArray({ x: 1 }), [1]);
  assert.deepEqual(Store.mapToArray(null), []);
});
