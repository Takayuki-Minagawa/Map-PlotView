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

test('parseCSV: 基本列と表示項目列を点として取り込む', () => {
  const Store = newStore();
  const doc = Store.parseCSV([
    'id,name,tag,type,lat,lng,note,用途,階数',
    'p1,"A, ""quoted""",site,point,35.5,139.5,memo,商業,12',
    ',B,,,36,140,,,'
  ].join('\n'));
  assert.equal(doc.warnings.length, 0);
  assert.equal(doc.view, null, 'CSVにはviewが無い');
  assert.equal(doc.features.length, 2);

  const a = doc.features[0];
  assert.equal(a.id, 'p1');
  assert.equal(a.name, 'A, "quoted"');
  assert.equal(a.tag, 'site');
  assert.deepEqual(a.coordinates, [35.5, 139.5]);
  assert.equal(a.note, 'memo');
  assert.deepEqual(a.properties, { 用途: '商業', 階数: 12 }, '未知の列は表示項目、数値は数値化');

  const b = doc.features[1];
  assert.match(b.id, /^p\d{3}$/, 'ID欠落時は自動採番');
  assert.equal(b.tag, '__uncategorized__');
  assert.deepEqual(b.properties, {}, '空セルは表示項目にしない');
  assert.equal('note' in b, false);

  assert.deepEqual(doc.tags.map(t => t.id).sort(), ['__uncategorized__', 'site']);
});

test('parseCSV: 日本語見出し・BOM・CRLF・引用符内改行に対応する', () => {
  const Store = newStore();
  const doc = Store.parseCSV('﻿名称,緯度,経度,メモ\r\n観測点,35.1,139.1,"1行目\n2行目"\r\n');
  assert.equal(doc.features.length, 1);
  assert.equal(doc.features[0].name, '観測点');
  assert.deepEqual(doc.features[0].coordinates, [35.1, 139.1]);
  assert.equal(doc.features[0].note, '1行目\n2行目');
});

test('parseCSV: 見出しの大小・別名（Latitude/Longitude/lon）を認識する', () => {
  const Store = newStore();
  const a = Store.parseCSV('Name,Latitude,Longitude\nX,35,139');
  assert.deepEqual(a.features[0].coordinates, [35, 139]);
  const b = Store.parseCSV('lon,lat\n139,35');
  assert.deepEqual(b.features[0].coordinates, [35, 139], '列順に依存しない');
});

test('parseCSV: タブ区切り・セミコロン区切りを自動判定する', () => {
  const Store = newStore();
  const tsv = Store.parseCSV('name\tlat\tlng\nA, B\t35\t139');
  assert.equal(tsv.features[0].name, 'A, B');
  const semi = Store.parseCSV('name;lat;lng\nC;35;139');
  assert.equal(semi.features[0].name, 'C');
});

test('parseCSV: 不正な座標・線/面の行は警告してスキップする', () => {
  const Store = newStore();
  const doc = Store.parseCSV([
    'id,type,lat,lng',
    'ok,point,35,139',
    'bad,point,abc,139',
    'far,point,95,139',
    'l1,line,35,139',
    'empty,,,'
  ].join('\n'));
  assert.deepEqual(doc.features.map(f => f.id), ['ok']);
  assert.equal(doc.warnings.length, 4);
  assert.ok(doc.warnings[0].includes('3行目'), '警告は元の行番号を示す: ' + doc.warnings[0]);
  assert.ok(doc.warnings[2].includes('line'));
});

test('parseCSV: 重複IDは採番し直し、既存IDとは衝突させない', () => {
  const Store = newStore();
  const doc = Store.parseCSV('id,lat,lng\np001,35,139\np001,36,140\n,37,141');
  const ids = doc.features.map(f => f.id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[0], 'p001');
  assert.equal(doc.warnings.length, 1);
});

test('parseCSV: 空行は読み飛ばし、行番号は保つ', () => {
  const Store = newStore();
  const doc = Store.parseCSV('\nlat,lng\n\n35,139\n\nx,139\n');
  assert.equal(doc.features.length, 1);
  assert.ok(doc.warnings[0].includes('6行目'), doc.warnings[0]);
});

test('parseCSV: 見出しのみ・緯度経度列なし・空はthrowする', () => {
  const Store = newStore();
  assert.throws(() => Store.parseCSV(''));
  assert.throws(() => Store.parseCSV('lat,lng\n'));
  assert.throws(() => Store.parseCSV('name,address\nA,Tokyo'));
});

test('parseCSV: UI.toCSV の出力を取り込める（点のラウンドトリップ）', () => {
  const sandbox = createSandbox({ jsyaml });
  loadScript('i18n.js', sandbox);
  loadScript('symbols.js', sandbox);
  loadScript('store.js', sandbox);
  loadScript('ui.js', sandbox);
  const orig = [
    { id: 'p1', type: 'point', tag: 'site', name: 'A', coordinates: [35.5, 139.5], note: 'n', properties: { 用途: '商業', 階数: 3 } },
    { id: 'p2', type: 'point', tag: 'site', name: 'B', coordinates: [36, 140], properties: { 備考欄: 'x,y' } },
    { id: 'l1', type: 'line', tag: 'road', name: 'L', coordinates: [[35, 139], [36, 140]] }
  ];
  const doc = sandbox.Store.parseCSV(sandbox.UI.toCSV(orig));
  assert.equal(doc.features.length, 2, '線は警告付きでスキップ');
  assert.equal(doc.warnings.length, 1);
  assert.deepEqual(doc.features[0], orig[0]);
  assert.deepEqual(doc.features[1].properties, { 備考欄: 'x,y' });
});
