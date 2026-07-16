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

test('toGeoJSONCollection: FeatureCollectionを生成する', () => {
  const { UI } = newUI();
  const fc = UI.toGeoJSONCollection([
    { id: 'p1', type: 'point', tag: 't', coordinates: [35, 139] }
  ]);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].geometry.coordinates, [139, 35]);
});
