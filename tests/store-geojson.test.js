'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');
const { createSandbox, loadScript } = require('./helpers/load');

function newStore() {
  const sandbox = createSandbox({ jsyaml });
  loadScript('i18n.js', sandbox); // 警告メッセージの変数展開に必要
  loadScript('store.js', sandbox);
  return sandbox.Store;
}

function fc(features) {
  return JSON.stringify({ type: 'FeatureCollection', features });
}

test('parseGeoJSON: FeatureCollectionを内部構造へ変換する', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    {
      type: 'Feature', id: 'p1',
      properties: { name: 'A', tag: 'site', memo: 'x' },
      geometry: { type: 'Point', coordinates: [139.7, 35.6] }
    },
    {
      type: 'Feature',
      properties: { tag: 'road' },
      geometry: { type: 'LineString', coordinates: [[139, 35], [140, 36]] }
    }
  ]));
  assert.equal(doc.features.length, 2);
  assert.equal(doc.warnings.length, 0);
  assert.equal(doc.view, null, 'GeoJSONにはviewが無いのでnull（現在位置維持）');

  const p = doc.features[0];
  assert.deepEqual(p.coordinates, [35.6, 139.7], '[lng,lat]→[lat,lng]');
  assert.equal(p.tag, 'site');
  assert.equal(p.name, 'A');
  assert.deepEqual(p.properties, { memo: 'x' });

  const l = doc.features[1];
  assert.equal(l.type, 'line');
  assert.match(l.id, /^l\d{3}$/, 'ID欠落時はtype別に自動採番');

  assert.deepEqual(doc.tags.map(t => t.id).sort(), ['road', 'site'], 'properties.tagからタグを自動生成');
  assert.ok(doc.tags.every(t => t.color), 'タグに色が割り当てられる');
});

test('parseGeoJSON: 単一Featureも受け付ける', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [139, 35] }
  }));
  assert.equal(doc.features.length, 1);
  assert.equal(doc.features[0].tag, '__uncategorized__');
  assert.ok(doc.tags.some(t => t.id === '__uncategorized__'));
});

test('parseGeoJSON: properties無しのFeatureは未分類になる', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', geometry: { type: 'Point', coordinates: [139, 35] } }
  ]));
  assert.equal(doc.features[0].tag, '__uncategorized__');
});

test('parseGeoJSON: 未対応geometryはスキップして警告を出す', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [] } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [139, 35] } }
  ]));
  assert.equal(doc.features.length, 1);
  assert.equal(doc.warnings.length, 1);
  assert.ok(doc.warnings[0].indexOf('MultiPolygon') !== -1);
});

test('parseGeoJSON: 範囲外座標のFeatureはスキップして警告を出す', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', id: 'bad', geometry: { type: 'Point', coordinates: [139, 999] } }
  ]));
  assert.equal(doc.features.length, 0);
  assert.equal(doc.warnings.length, 1);
});

test('parseGeoJSON: 自動採番は既存IDを避ける', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', id: 'p001', geometry: { type: 'Point', coordinates: [139, 35] } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [139.1, 35.1] } }
  ]));
  const ids = doc.features.map(f => f.id);
  assert.equal(ids[0], 'p001');
  assert.equal(ids[1], 'p002', 'p001を避けて採番');
});

test('parseGeoJSON: 数値のid/tagは文字列へ正規化される', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', id: 7, properties: { tag: 123 }, geometry: { type: 'Point', coordinates: [139, 35] } }
  ]));
  assert.equal(doc.features[0].id, '7');
  assert.equal(doc.features[0].tag, '123');
  assert.equal(doc.tags[0].id, '123');
});

test('parseGeoJSON: id=0 も有効なIDとして保持される', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', id: 0, geometry: { type: 'Point', coordinates: [139, 35] } }
  ]));
  assert.equal(doc.features[0].id, '0');
});

test('parseGeoJSON: 座標が壊れたFeatureは警告スキップし他は読み込む', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', geometry: { type: 'Point' } },                               // coordinates欠落
    { type: 'Feature', geometry: { type: 'LineString', coordinates: null } },      // null座標
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: ['broken'] } },   // 非配列リング
    { type: 'Feature', geometry: { type: 'Point', coordinates: [139, 35] } }
  ]));
  assert.equal(doc.features.length, 1, '正常な1件だけ読み込まれる');
  assert.equal(doc.warnings.length, 3);
});

test('parseGeoJSON: ID重複は警告つきで再採番される', () => {
  const Store = newStore();
  const doc = Store.parseGeoJSON(fc([
    { type: 'Feature', id: 'a', geometry: { type: 'Point', coordinates: [139, 35] } },
    { type: 'Feature', id: 'a', geometry: { type: 'Point', coordinates: [139.1, 35.1] } }
  ]));
  assert.equal(doc.features.length, 2);
  assert.equal(doc.features[0].id, 'a');
  assert.notEqual(doc.features[1].id, 'a');
  assert.equal(doc.warnings.length, 1);
});

test('parseGeoJSON: 構文エラー・Feature無しはthrowする', () => {
  const Store = newStore();
  assert.throws(() => Store.parseGeoJSON('{invalid'));
  assert.throws(() => Store.parseGeoJSON('{}'));
  assert.throws(() => Store.parseGeoJSON(fc([])));
  assert.throws(() => Store.parseGeoJSON('123'));
});

test('parseGeoJSON: toGeoJSONCollection出力を再インポートできる（往復）', () => {
  const Store = newStore();
  const original = {
    id: 'g001', type: 'polygon', tag: 'zone', name: 'Z',
    coordinates: [[[35, 139], [36, 139], [36, 140]]],
    properties: { level: 3 }
  };
  const exported = JSON.stringify({ type: 'FeatureCollection', features: [Store.toGeoJSON(original)] });
  const doc = Store.parseGeoJSON(exported);
  assert.equal(doc.warnings.length, 0);
  const back = doc.features[0];
  assert.equal(back.id, 'g001');
  assert.equal(back.tag, 'zone');
  assert.deepEqual(back.coordinates, original.coordinates);
  assert.deepEqual(back.properties, { level: 3 });
});
