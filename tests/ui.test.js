'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');
const { createSandbox, loadScript } = require('./helpers/load');

function newUI() {
  const sandbox = createSandbox({ jsyaml });
  loadScript('symbols.js', sandbox);
  loadScript('store.js', sandbox);
  loadScript('ui.js', sandbox);
  return sandbox;
}

test('toCSV: 点の座標・カンマや引用符のエスケープ・改行の除去', () => {
  const { UI } = newUI();
  const csv = UI.toCSV([
    { id: 'p1', type: 'point', tag: 'site', name: 'A, "quoted"', coordinates: [35.5, 139.5], note: 'line1\nline2' },
    { id: 'l1', type: 'line', tag: 'road', name: 'L', coordinates: [[35, 139], [36, 140]] }
  ], { site: { id: 'site' } });
  const lines = csv.split('\n');
  assert.equal(lines[0], 'id,name,tag,type,lat,lng,note');
  assert.equal(lines[1], 'p1,"A, ""quoted""",site,point,35.5,139.5,line1 line2');
  assert.equal(lines[2], 'l1,L,road,line,35,139,', '線は先頭頂点を代表点にする');
});

test('toCSV: CRLF改行のメモも1行に整形される', () => {
  const { UI } = newUI();
  const csv = UI.toCSV([
    { id: 'p1', type: 'point', tag: 't', name: 'A', coordinates: [35, 139], note: 'a\r\nb' }
  ], {});
  assert.equal(csv.split('\n')[1], 'p1,A,t,point,35,139,a b');
});

test('toGeoJSONCollection: FeatureCollectionを生成する', () => {
  const { UI } = newUI();
  const fc = UI.toGeoJSONCollection([
    { id: 'p1', type: 'point', tag: 't', coordinates: [35, 139] }
  ]);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].geometry.coordinates, [139, 35]);
});

test('toCSV: 表示項目(properties)を追加列として出力する', () => {
  const { UI } = newUI();
  const csv = UI.toCSV([
    { id: 'p1', type: 'point', tag: 't', name: 'A', coordinates: [35, 139], properties: { 用途: '商業', 階数: 3 } },
    { id: 'p2', type: 'point', tag: 't', name: 'B', coordinates: [36, 140], properties: { 階数: 5, 詳細: { a: 1 } } },
    { id: 'p3', type: 'point', tag: 't', name: 'C', coordinates: [37, 141] }
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'id,name,tag,type,lat,lng,note,用途,階数,詳細', '列は出現順の和集合');
  assert.equal(lines[1], 'p1,A,t,point,35,139,,商業,3,');
  assert.equal(lines[2], 'p2,B,t,point,36,140,,,5,"{""a"":1}"');
  assert.equal(lines[3], 'p3,C,t,point,37,141,,,,');
});

test('parseProps: key: value を解釈し、値の型を推定する', () => {
  const { UI } = newUI();
  assert.deepEqual(UI.parseProps('用途: 商業施設\n階数: 12\nURL: https://example.com/a\n\nno-colon\n: novalue\n郵便番号: 0600001'), {
    用途: '商業施設',
    階数: 12,
    URL: 'https://example.com/a',
    郵便番号: '0600001'
  });
  assert.deepEqual(UI.parseProps(''), {});
});
