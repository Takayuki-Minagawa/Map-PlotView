'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');
const { createSandbox, loadScript } = require('./helpers/load');

function newStore() {
  const sandbox = createSandbox({ jsyaml });
  loadScript('i18n.js', sandbox);
  loadScript('store.js', sandbox);
  return sandbox.Store;
}

const pt = (id, tag) => ({ id, type: 'point', tag: tag || 'a', coordinates: [35, 139] });

test('mergeData: タグは既存優先で統合し、フィーチャを追加する', () => {
  const Store = newStore();
  const current = {
    tags: [{ id: 'a', name: '既存A', color: '#111111' }],
    features: [pt('p001')]
  };
  const incoming = {
    tags: [{ id: 'a', name: '取込A', color: '#222222' }, { id: 'b', name: 'B', color: '#333333' }],
    features: [pt('x1', 'b')],
    warnings: ['w']
  };
  const out = Store.mergeData(current, incoming);
  assert.deepEqual(out.tags.map(t => t.id), ['a', 'b']);
  assert.equal(out.tags[0].name, '既存A', '同じIDのタグは既存の定義を残す');
  assert.deepEqual(out.features.map(f => f.id), ['p001', 'x1']);
  assert.deepEqual(out.warnings, ['w'], '取込時の警告を引き継ぐ');
});

test('mergeData: ID衝突は採番し直し、入力を変更しない', () => {
  const Store = newStore();
  const current = { tags: [], features: [pt('p001'), pt('p002')] };
  const incoming = { tags: [], features: [pt('p001'), pt('p003')], warnings: [] };
  const out = Store.mergeData(current, incoming);
  const ids = out.features.map(f => f.id);
  assert.equal(new Set(ids).size, 4, 'IDは一意');
  assert.deepEqual(ids.slice(0, 2), ['p001', 'p002']);
  assert.equal(ids[2], 'p004', '取込側に後続するp003とも衝突しない番号を選ぶ');
  assert.equal(ids[3], 'p003');
  assert.equal(out.warnings.length, 1);
  assert.equal(incoming.features[0].id, 'p001', '入力オブジェクトは書き換えない');
  assert.equal(current.features.length, 2);
});

test('detectFormat: 拡張子を優先し、不明なら内容で判定する', () => {
  const Store = newStore();
  assert.equal(Store.detectFormat('a.yaml', ''), 'yaml');
  assert.equal(Store.detectFormat('a.YML', ''), 'yaml');
  assert.equal(Store.detectFormat('a.geojson', ''), 'geojson');
  assert.equal(Store.detectFormat('a.json', ''), 'geojson');
  assert.equal(Store.detectFormat('a.csv', ''), 'csv');
  assert.equal(Store.detectFormat('a.tsv', ''), 'csv');
  assert.equal(Store.detectFormat('data.txt', '  {"type":"FeatureCollection"}'), 'geojson');
  assert.equal(Store.detectFormat('data.txt', 'version: 2'), 'yaml');
  assert.equal(Store.detectFormat('', 'version: 2'), 'yaml');
});

test('parseText: 形式名に応じたパーサへ振り分ける', () => {
  const Store = newStore();
  assert.equal(Store.parseText('csv', 'lat,lng\n35,139').features.length, 1);
  assert.equal(Store.parseText('geojson', JSON.stringify({
    type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [139, 35] }
  })).features.length, 1);
  assert.equal(Store.parseText('yaml', 'features:\n  - { id: f1, type: point, coordinates: [35, 139] }').features.length, 1);
});

test('nextFreeId: オブジェクトとMapのどちらの使用済み集合でも採番できる', () => {
  const Store = newStore();
  assert.equal(Store.nextFreeId('point', {}), 'p001');
  assert.equal(Store.nextFreeId('line', { l001: true }), 'l002');
  assert.equal(Store.nextFreeId('polygon', new Map([['g001', {}], ['g002', {}]])), 'g003');
  assert.equal(Store.nextFreeId('point', null), 'p001');
});

test('uncategorizedTag: 呼び出しごとに新しいオブジェクトを返す', () => {
  const Store = newStore();
  const a = Store.uncategorizedTag();
  const b = Store.uncategorizedTag();
  assert.equal(a.id, Store.UNCATEGORIZED_ID);
  assert.notEqual(a, b);
});

test('mergeData: constructor のようなID・タグも通常どおり統合する', () => {
  const Store = newStore();
  const out = Store.mergeData(
    { tags: [], features: [] },
    { tags: [{ id: 'constructor' }], features: [pt('toString', 'constructor')], warnings: [] }
  );
  assert.deepEqual(out.tags.map(t => t.id), ['constructor']);
  assert.deepEqual(out.features.map(f => f.id), ['toString']);
  assert.equal(out.warnings.length, 0);
});

test('mergeData: 多数の衝突でも採番が重複しない', () => {
  const Store = newStore();
  const mk = n => Array.from({ length: n }, (_, i) => pt('p' + String(i + 1).padStart(3, '0')));
  const out = Store.mergeData({ tags: [], features: mk(300) }, { tags: [], features: mk(300), warnings: [] });
  assert.equal(new Set(out.features.map(f => f.id)).size, 600);
  assert.equal(out.warnings.length, 300);
  assert.equal(out.features[300].id, 'p301');
});
