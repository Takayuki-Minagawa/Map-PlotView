'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadScript } = require('./helpers/load');

/* Leaflet無しで読み込める範囲（静的ヘルパ）だけを検証する */
function newMapView() {
  const sandbox = createSandbox({});
  loadScript('mapview.js', sandbox);
  return sandbox.MapView;
}

/* L.LatLng の最小スタブ（wrap は経度を -180〜180 へ折り返す） */
function ll(lat, lng) {
  return { lat, lng, wrap() { return ll(lat, ((lng + 180) % 360 + 360) % 360 - 180); } };
}

test('layerToCoords: 点・線・面を内部座標（丸め済みの[緯度,経度]）へ変換する', () => {
  const MapView = newMapView();
  assert.deepEqual(MapView.layerToCoords('point', { getLatLng: () => ll(35.12345678, 139.7) }), [35.123457, 139.7]);
  assert.deepEqual(MapView.layerToCoords('line', { getLatLngs: () => [ll(35, 139), ll(36, 140)] }), [[35, 139], [36, 140]]);
  assert.deepEqual(
    MapView.layerToCoords('polygon', { getLatLngs: () => [[ll(35, 139), ll(36, 139), ll(36, 140)]] }),
    [[[35, 139], [36, 139], [36, 140]]]);
});

test('layerToCoords: 経度±180の外で描いた図形は形を保ったまま360°単位で戻す', () => {
  const MapView = newMapView();
  assert.deepEqual(MapView.layerToCoords('point', { getLatLng: () => ll(35, -221) }), [35, 139]);
  assert.deepEqual(MapView.layerToCoords('line', { getLatLngs: () => [ll(35, 499), ll(35, 501)] }), [[35, 139], [35, 141]]);
  assert.deepEqual(
    MapView.layerToCoords('line', { getLatLngs: () => [ll(35, 179), ll(35, 181)] }),
    [[35, 179], [35, 181]],
    '±180°をまたぐ線は頂点ごとに折り返さない（地球を一周する線にしない）');
});

test('boundsToGeoJSON: 西南東北の境界から閉じたPolygonとbboxを作る', () => {
  const MapView = newMapView();
  const gj = MapView.boundsToGeoJSON({ getWest: () => 139, getSouth: () => 35, getEast: () => 140, getNorth: () => 36 });
  assert.deepEqual(gj.bbox, [139, 35, 140, 36]);
  assert.deepEqual(gj.geometry.coordinates[0][0], gj.geometry.coordinates[0][4]);
});

test('オーバーレイ定義: すべてhttpsのタイルURLと出典を持つ', () => {
  const MapView = newMapView();
  const defs = Object.assign({}, MapView.OVERLAY_DEFS);
  assert.deepEqual(Object.keys(defs), ['hillshade', 'relief', 'afm', 'flood', 'sediment', 'tsunami']);
  Object.keys(defs).forEach(k => {
    assert.ok(defs[k].urls.length >= 1 && defs[k].urls.every(u => /^https:\/\/.+\{z\}\/\{x\}\/\{y\}\.png$/.test(u)), k);
    assert.ok(defs[k].attr && defs[k].max >= 15, k);
  });
});

test('layerToCoords: 範囲内の座標にずれを加えない / 空の面でも例外にしない', () => {
  const MapView = newMapView();
  assert.deepEqual(MapView.layerToCoords('point', { getLatLng: () => ll(35.6812345, 139.7671234) }), [35.681235, 139.767123]);
  assert.deepEqual(MapView.layerToCoords('polygon', { getLatLngs: () => [] }), []);
});

test('setBaseLayer / toggleOverlay: 未知の名前（constructor 等）は既定の背景へ / 無視する', () => {
  const MapView = newMapView();
  const added = [];
  const layer = name => ({ addTo() { added.push(name); } });
  const self = {
    baseLayers: { pale: layer('pale'), osm: layer('osm') },
    overlayLayers: { afm: layer('afm') },
    currentBaseKey: null,
    map: { removeLayer() {}, hasLayer: () => false }
  };
  ['constructor', '__proto__', 'toString', 'nosuch'].forEach(key => {
    MapView.prototype.setBaseLayer.call(self, key);
    assert.equal(self.currentBaseKey, 'pale', key);
    assert.equal(MapView.prototype.toggleOverlay.call(self, key, true), false, key);
  });
  MapView.prototype.setBaseLayer.call(self, 'osm');
  assert.equal(self.currentBaseKey, 'osm');
  assert.equal(MapView.prototype.toggleOverlay.call(self, 'afm', true), true);
  assert.deepEqual(added, ['pale', 'pale', 'pale', 'pale', 'osm', 'afm']);
});
