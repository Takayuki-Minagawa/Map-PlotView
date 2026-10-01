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

test('parseYaml: タイムスタンプ風の値をDateにせず文字列のまま保持する', () => {
  const Store = newStore();
  const src = [
    'features:',
    '  - id: f1',
    '    type: point',
    '    coordinates: [35, 139]',
    '    properties:',
    '      発生日時: 2026-03-02T04:15:00+09:00',
    '      着工予定: 2027-04'
  ].join('\n');
  const doc = Store.parseYaml(src);
  assert.equal(doc.features[0].properties['発生日時'], '2026-03-02T04:15:00+09:00');
  const again = Store.parseYaml(Store.dumpYaml({ tags: doc.tags, features: doc.features }));
  assert.equal(again.features[0].properties['発生日時'], '2026-03-02T04:15:00+09:00', '保存→再読込で表記が変わらない');
});

test('parseYaml: 数値のID・タグ・名称・メモは文字列へ正規化する', () => {
  const Store = newStore();
  const doc = Store.parseYaml([
    'tags:',
    '  - { id: 7, name: Seven }',
    'features:',
    '  - { id: 1, type: point, tag: 7, name: 123, note: 456, coordinates: [35, 139] }'
  ].join('\n'));
  assert.equal(doc.warnings.length, 0);
  assert.equal(doc.tags[0].id, '7');
  const f = doc.features[0];
  assert.equal(f.id, '1');
  assert.equal(f.tag, '7', '数値タグも定義済みタグと一致する');
  assert.equal(f.name, '123');
  assert.equal(f.note, '456');
});

test('parseYaml: 重複IDは採番し直して警告する', () => {
  const Store = newStore();
  const doc = Store.parseYaml([
    'features:',
    '  - { id: p001, type: point, coordinates: [35, 139] }',
    '  - { id: p001, type: point, coordinates: [36, 140] }',
    '  - { id: p002, type: point, coordinates: [37, 141] }'
  ].join('\n'));
  const ids = doc.features.map(f => f.id);
  assert.equal(doc.features.length, 3, '重複しても捨てない');
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[1], 'p003', '後続のp002と衝突しない番号');
  assert.equal(doc.warnings.length, 1);
});

test('parseYaml: 不正なタグ定義・重複タグはスキップして警告する', () => {
  const Store = newStore();
  const doc = Store.parseYaml([
    'tags:',
    '  - ~',
    '  - { name: no-id }',
    '  - { id: a, name: A }',
    '  - { id: a, name: A2 }',
    '  - just-a-string'
  ].join('\n'));
  assert.deepEqual(doc.tags.map(t => t.name), ['A']);
  assert.equal(doc.warnings.length, 4);
});

test('parseYaml: 不正なviewは既定値で補う', () => {
  const Store = newStore();
  const bad = Store.parseYaml('view: { center: [999, 0], zoom: abc, overlays: afm, overlayOpacity: 5 }');
  assert.deepEqual(bad.view.center, Store.DEFAULT_VIEW.center);
  assert.equal(bad.view.zoom, Store.DEFAULT_VIEW.zoom);
  assert.deepEqual(bad.view.overlays, []);
  assert.equal(bad.view.overlayOpacity, Store.DEFAULT_VIEW.overlayOpacity);

  const ok = Store.parseYaml('view: { center: [34, 135], zoom: 9, baseLayer: osm, overlays: [afm, 3], overlayOpacity: 0.5 }');
  assert.deepEqual(ok.view, { center: [34, 135], zoom: 9, baseLayer: 'osm', overlays: ['afm'], overlayOpacity: 0.5 });

  assert.deepEqual(Store.parseYaml('view: nope').view, Store.DEFAULT_VIEW);
});

test('parseYaml: 配列ドキュメント・不正なmeta/properties/photosを安全に扱う', () => {
  const Store = newStore();
  assert.throws(() => Store.parseYaml('- a\n- b'), '最上位が配列ならthrow');
  const doc = Store.parseYaml([
    'meta: text',
    'features:',
    '  - id: f1',
    '    type: point',
    '    coordinates: [35, 139]',
    '    properties: [1, 2]',
    '    photos:',
    '      - { src: a.jpg }',
    '      - not-a-photo',
    '      - { caption: no-src }',
    '  - { id: f2, type: point, coordinates: [35, 139], photos: none }'
  ].join('\n'));
  assert.deepEqual(doc.meta, {});
  assert.deepEqual(doc.features[0].properties, {});
  assert.deepEqual(doc.features[0].photos, [{ src: 'a.jpg' }]);
  assert.equal('photos' in doc.features[1], false);
});

test('parseYaml: 入力のオブジェクトを書き換えない既定viewを返す', () => {
  const Store = newStore();
  const a = Store.parseYaml('features: []');
  a.view.zoom = 3;
  assert.equal(Store.DEFAULT_VIEW.zoom, 13, 'DEFAULT_VIEW は共有されない');
});
