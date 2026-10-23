'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');
const { DOMParser } = require('@xmldom/xmldom');
const { createSandbox, loadScript } = require('./helpers/load');

/* ブラウザの DOMParser の代わりに xmldom を注入する */
function newStore(withParser) {
  const sandbox = createSandbox(withParser === false ? { jsyaml } : { jsyaml, DOMParser });
  ['i18n.js', 'symbols.js', 'store.js', 'ui.js'].forEach(name => loadScript(name, sandbox));
  return sandbox;
}

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>調査地点</name>
  <Folder>
    <name>建設サイト</name>
    <Placemark id="pm1">
      <name>A棟</name>
      <description><![CDATA[<p>1行目<br>2行目 &amp; 補足</p>]]></description>
      <ExtendedData>
        <Data name="用途"><value>商業</value></Data>
        <Data name="階数"><value>12</value></Data>
      </ExtendedData>
      <Point><coordinates>139.7, 35.69, 0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>道路</name>
      <LineString><coordinates>
        139.70,35.68,0 139.71,35.685,0
        139.72,35.69,0
      </coordinates></LineString>
    </Placemark>
  </Folder>
  <Placemark>
    <name>敷地</name>
    <Polygon>
      <outerBoundaryIs><LinearRing><coordinates>139,35 140,35 140,36 139,36 139,35</coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>139.2,35.2 139.4,35.2 139.4,35.4 139.2,35.2</coordinates></LinearRing></innerBoundaryIs>
    </Polygon>
  </Placemark>
  <Placemark>
    <name>複合</name>
    <MultiGeometry>
      <Point><coordinates>139.1,35.1</coordinates></Point>
      <LineString><coordinates>139.1,35.1 139.2,35.2</coordinates></LineString>
    </MultiGeometry>
  </Placemark>
  <Placemark>
    <name>軌跡</name>
    <gx:Track><gx:coord>139.5 35.5 10</gx:coord><gx:coord>139.6 35.6 12</gx:coord></gx:Track>
  </Placemark>
  <Placemark><name>形状なし</name></Placemark>
  <Placemark><name>範囲外</name><Point><coordinates>200,35</coordinates></Point></Placemark>
</Document>
</kml>`;

test('parseKML: 点・線・穴あき面・MultiGeometry・gx:Track を取り込む', () => {
  const { Store } = newStore();
  const r = Store.parseKML(KML);
  assert.equal(r.view, null);
  assert.deepEqual(r.meta, { title: '調査地点' });
  const byName = Object.fromEntries(r.features.map(f => [f.name, f]));

  const a = byName['A棟'];
  assert.equal(a.id, 'pm1', 'Placemark の id 属性を使う');
  assert.equal(a.type, 'point');
  assert.deepEqual(a.coordinates, [35.69, 139.7], '経度,緯度 → [緯度,経度]（カンマ後の空白も許容）');
  assert.equal(a.tag, '建設サイト', '親Folderの名称をタグにする');
  assert.deepEqual(a.properties, { 用途: '商業', 階数: 12 });
  assert.equal(a.note, '1行目\n2行目 & 補足', 'HTMLのdescriptionはテキストにする');

  assert.deepEqual(byName['道路'].coordinates, [[35.68, 139.7], [35.685, 139.71], [35.69, 139.72]], '改行区切りの座標');

  const site = byName['敷地'];
  assert.equal(site.type, 'polygon');
  assert.equal(site.tag, Store.UNCATEGORIZED_ID, 'Folder外は未分類');
  assert.deepEqual(site.coordinates[0], [[35, 139], [35, 140], [36, 140], [36, 139]], '閉じたリングは開いた形へ');
  assert.equal(site.coordinates.length, 2, '穴（innerBoundaryIs）も保持');

  assert.deepEqual(r.features.filter(f => f.name === '複合').map(f => f.type), ['point', 'line'], 'MultiGeometryは分割');
  assert.deepEqual(byName['軌跡'].coordinates, [[35.5, 139.5], [35.6, 139.6]]);

  assert.equal(r.features.length, 6);
  assert.equal(new Set(r.features.map(f => f.id)).size, 6, 'IDは一意');
  assert.equal(r.warnings.length, 2, '形状なし・範囲外の警告');
  assert.match(r.warnings[0], /形状なし/);
  assert.match(r.warnings[1], /Placemark\[6\]/);
  assert.deepEqual(r.tags.map(t => [t.id, t.name]), [['建設サイト', '建設サイト'], [Store.UNCATEGORIZED_ID, '未分類']]);
});

test('parseKML: Placemark が無い・構文エラー・DOMParser 非対応はエラー', () => {
  const { Store } = newStore();
  assert.throws(() => Store.parseKML('<kml><Document/></kml>'), /Placemark/);
  assert.throws(() => Store.parseKML('<kml><Document></kml>'), /XML構文エラー/);
  const noParser = newStore(false);
  assert.throws(() => noParser.Store.parseKML(KML), /DOMParser/);
});

test('parseKML: 重複した id 属性は採番し直す', () => {
  const { Store } = newStore();
  const r = Store.parseKML(`<kml><Document>
    <Placemark id="x"><Point><coordinates>139,35</coordinates></Point></Placemark>
    <Placemark id="x"><Point><coordinates>139.1,35.1</coordinates></Point></Placemark>
  </Document></kml>`);
  assert.deepEqual(r.features.map(f => f.id), ['x', 'p001']);
  assert.match(r.warnings[0], /Placemark\[1\].*"x".*"p001"/);
});

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>週末の山行</name></metadata>
  <wpt lat="35.3606" lon="138.7274"><ele>3776</ele><time>2026-08-01T05:00:00Z</time><name>山頂</name><desc>剣ヶ峰</desc></wpt>
  <wpt lat="35.4" lon="138.7"><name>登山口</name></wpt>
  <rte><name>計画</name><rtept lat="35.40" lon="138.70"/><rtept lat="35.36" lon="138.72"/></rte>
  <trk><name>実績</name>
    <trkseg><trkpt lat="35.40" lon="138.70"><ele>2300</ele></trkpt><trkpt lat="35.38" lon="138.71"/></trkseg>
    <trkseg><trkpt lat="35.37" lon="138.72"/><trkpt lat="35.36" lon="138.727"/></trkseg>
  </trk>
  <trk><name>1点だけ</name><trkseg><trkpt lat="35" lon="138"/></trkseg></trk>
</gpx>`;

test('parseGPX: ウェイポイントは点、ルート・トラック区間は線', () => {
  const { Store } = newStore();
  const r = Store.parseGPX(GPX);
  assert.deepEqual(r.meta, { title: '週末の山行' });
  const top = r.features[0];
  assert.equal(top.type, 'point');
  assert.equal(top.tag, 'waypoint');
  assert.deepEqual(top.coordinates, [35.3606, 138.7274]);
  assert.deepEqual(top.properties, { '標高(m)': 3776, time: '2026-08-01T05:00:00Z' });
  assert.equal(top.note, '剣ヶ峰');
  assert.deepEqual(r.features.map(f => [f.type, f.tag, f.name]), [
    ['point', 'waypoint', '山頂'],
    ['point', 'waypoint', '登山口'],
    ['line', 'route', '計画'],
    ['line', 'track', '実績 (1)'],
    ['line', 'track', '実績 (2)']
  ]);
  assert.equal(r.warnings.length, 1, '1点だけのトラックは線にならない');
  assert.match(r.warnings[0], /trk\[1\]/);
  assert.deepEqual(r.tags.map(t => [t.id, t.name]), [['waypoint', 'ウェイポイント'], ['route', 'ルート'], ['track', 'トラック']]);
});

test('parseGPX: 中身が無い・GPXでないXMLはエラー', () => {
  const { Store } = newStore();
  assert.throws(() => Store.parseGPX('<gpx version="1.1"></gpx>'), /ウェイポイント/);
  assert.throws(() => Store.parseGPX('<kml/>'), /ウェイポイント/);
});

test('detectFormat / parseText: KML・GPX を拡張子と内容で判定する', () => {
  const { Store } = newStore();
  assert.equal(Store.detectFormat('a.KML', ''), 'kml');
  assert.equal(Store.detectFormat('track.gpx', ''), 'gpx');
  assert.equal(Store.detectFormat('export.xml', '﻿<?xml version="1.0"?><gpx></gpx>'), 'gpx');
  assert.equal(Store.detectFormat('doc.xml', '<?xml version="1.0"?><kml></kml>'), 'kml');
  assert.equal(Store.detectFormat('', '<kml:kml xmlns:kml="x"/>'), 'kml');
  assert.equal(Store.parseText('gpx', GPX).features.length, 5);
  assert.equal(Store.parseText('kml', KML).features.length, 6);
});

test('UI.toKML → parseKML: タグ・表示項目・メモ・穴あき面が元どおりに戻る', () => {
  const { Store, UI } = newStore();
  const tags = [
    { id: 'site', name: '建設 & サイト', color: '#2e7d32' },
    { id: 'road', name: '道路', color: '#f00' },
    { id: 'unused', name: '未使用', color: '#000000' }
  ];
  const features = [
    { id: 'p1', type: 'point', tag: 'site', name: 'A<棟>', coordinates: [35.69, 139.7], properties: { 用途: '商業', 階数: 12, code: '007' }, note: 'メモ1\nメモ2' },
    { id: 'l1', type: 'line', tag: 'road', name: '', coordinates: [[35, 139], [35.5, 139.5]], properties: {} },
    { id: 'g1', type: 'polygon', tag: 'site', name: '敷地', coordinates: [[[35, 139], [35, 140], [36, 140]], [[35.2, 139.2], [35.2, 139.4], [35.4, 139.4]]] }
  ];
  const kml = UI.toKML(features, tags, { title: '案件 "X"' });
  assert.match(kml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(kml, /<name>案件 &quot;X&quot;<\/name>/);
  assert.match(kml, /<color>ff327d2e<\/color>/, '#2e7d32 → aabbggrr');
  assert.match(kml, /<color>ff0000ff<\/color>/, '#f00 は6桁へ展開');
  assert.doesNotMatch(kml, /未使用/, '使われていないタグのFolderは出さない');

  const r = Store.parseKML(kml);
  assert.deepEqual(r.meta, { title: '案件 "X"' });
  assert.deepEqual(r.features.map(f => [f.id, f.tag, f.name]), [['p1', 'site', 'A<棟>'], ['g1', 'site', '敷地'], ['l1', 'road', 'l1']]);
  const p1 = r.features[0];
  assert.deepEqual(p1.coordinates, [35.69, 139.7]);
  assert.deepEqual(p1.properties, { 用途: '商業', 階数: 12, code: '007' });
  assert.equal(p1.note, 'メモ1\nメモ2');
  assert.deepEqual(r.features[1].coordinates, features[2].coordinates, '閉じて書き出したリングは開いて戻る');
  assert.deepEqual(r.tags.map(t => [t.id, t.name]), [['site', '建設 & サイト'], ['road', '道路']], 'タグIDはExtendedData、名称はFolderから');
});

test('UI.toKML: 未定義タグ・不正な色・制御文字でも壊れたXMLにしない', () => {
  const { Store, UI } = newStore();
  const kml = UI.toKML([
    { id: 'p1', type: 'point', tag: 'ghost', name: 'a\u0001b', coordinates: [35, 139] }
  ], [{ id: 'x', color: 'rgb(1,2,3)' }], {});
  assert.match(kml, /<name>Map PlotView<\/name>/);
  const r = Store.parseKML(kml);
  assert.equal(r.features[0].name, 'ab');
  assert.equal(r.features[0].tag, 'ghost');
});
