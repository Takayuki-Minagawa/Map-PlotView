'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeApp } = require('./helpers/app-harness');

const YAML = [
  'meta: { title: 調査 }',
  'tags:',
  '  - { id: a, name: 建物, color: "#111111" }',
  '  - { id: b, name: 区域, color: "#222222" }',
  'features:',
  '  - { id: p1, type: point, tag: a, name: 本館, coordinates: [35, 139], properties: { 用途: 倉庫 }, note: 耐震補強済み }',
  '  - { id: p2, type: point, tag: a, name: 別館, coordinates: [35.1, 139.1] }',
  '  - { id: l1, type: line, tag: b, name: 通路, coordinates: [[35, 139], [35.1, 139.1]] }',
  '  - { id: g1, type: polygon, tag: b, name: 敷地, coordinates: [[[35, 139], [36, 139], [36, 140]]] }'
].join('\n');

function loaded(opts) {
  const h = makeApp(opts);
  h.App.importText(YAML, 'yaml');
  return h;
}

const names = h => h.cap.featureList.map(f => f.name);

test('一覧: 種別フィルタと、表示項目・メモも対象にした検索', () => {
  const h = loaded();
  assert.equal(h.cap.featureTotal, 4, '絞り込み前の件数を渡す');

  h.el('featureTypeFilter').fire('change', { target: { value: 'point' } });
  assert.deepEqual(names(h), ['本館', '別館']);

  h.el('featureSearch').fire('input', { target: { value: '倉庫' } });
  assert.deepEqual(names(h), ['本館'], '表示項目の値で検索');
  h.el('featureSearch').fire('input', { target: { value: '耐震' } });
  assert.deepEqual(names(h), ['本館'], 'メモで検索');
  h.el('featureSearch').fire('input', { target: { value: '用途' } });
  assert.deepEqual(names(h), ['本館'], '表示項目の名前で検索');

  h.el('featureTypeFilter').fire('change', { target: { value: 'line' } });
  assert.deepEqual(names(h), [], '種別と検索は両方に一致するものだけ');

  h.el('featureTypeFilter').fire('change', { target: { value: '' } });
  h.el('featureSearch').fire('input', { target: { value: '区域' } });
  assert.deepEqual(names(h), ['通路', '敷地'], 'タグ名で検索（従来どおり）');
});

test('タグ一覧: タグごとの件数を渡し、削除・追加で更新される', () => {
  const h = loaded();
  assert.equal(h.cap.tagCounts.a, 2);
  assert.equal(h.cap.tagCounts.b, 2);
  h.cap.detail.onDelete(h.state.features.get('p2'));
  assert.equal(h.cap.tagCounts.a, 1);
});

test('計測: 距離の表示、1点戻す、Escで終了（データは変えない）', () => {
  const h = loaded();
  const before = h.ids();
  h.el('btnMeasureLine').fire('click');
  const m = h.mapview.measure;
  assert.equal(m.mode, 'line');
  assert.equal(h.el('editBar').hidden, false);
  assert.equal(h.el('btnMeasureAdd').hidden, false);
  assert.equal(h.el('btnMeasureAdd').disabled, true, '2点未満では追加できない');
  assert.equal(h.el('btnMeasureUndo').disabled, true);
  assert.equal(h.el('btnReshapeDone').hidden, true);
  assert.equal(h.el('btnUndo').disabled, true, '計測中は元に戻す不可');

  m.click(35, 139);
  m.click(36, 139);
  assert.match(h.el('editBarLabel').textContent, /^距離 111\.195 km$/);
  assert.equal(h.el('btnMeasureAdd').disabled, false);

  h.key({ key: 'z', ctrlKey: true });
  assert.equal(m.count(), 1, 'Ctrl+Z は頂点を1つ戻す');
  assert.deepEqual(h.ids(), before, 'データの履歴操作にはならない');
  h.el('btnMeasureUndo').fire('click');
  assert.equal(m.count(), 0);

  h.key({ key: 'Escape' });
  assert.equal(h.mapview.measure, null, 'Escで計測を終了');
  assert.equal(h.el('editBar').hidden, true);
  assert.equal(h.el('btnMeasureAdd').hidden, true);
  assert.deepEqual(h.ids(), before);
});

test('計測: 面積を測って「プロットに追加」で面として登録できる', () => {
  const h = loaded();
  h.el('btnMeasureArea').fire('click');
  const m = h.mapview.measure;
  m.click(35, 139);
  m.click(35, 140);
  assert.equal(h.el('btnMeasureAdd').disabled, true, '面は3点以上');
  m.click(36, 140);
  assert.match(h.el('editBarLabel').textContent, /^面積 [\d.]+ km²（周長 [\d.]+ km）$/);

  h.el('btnMeasureAdd').fire('click');
  assert.equal(h.mapview.measure, null, '計測は終了する');
  const ed = h.cap.featureEditor;
  assert.equal(ed.feature.type, 'polygon');
  assert.deepEqual(ed.feature.coordinates, [[[35, 139], [35, 140], [36, 140]]]);
  ed.onSave(Object.assign({}, ed.feature, { name: '計測した面' }));
  assert.equal(h.state.features.get(ed.feature.id).name, '計測した面');
  h.App.undo();
  assert.equal(h.state.features.has(ed.feature.id), false, '追加は元に戻せる');
});

test('計測: 別のセッションを始めると計測は終わる', () => {
  const h = loaded();
  h.el('btnMeasureLine').fire('click');
  h.el('btnRectSelect').fire('click');
  assert.equal(h.mapview.measure, null);
  assert.equal(h.el('btnMeasureAdd').hidden, true);
});

test('右クリックメニュー: 点の追加と座標コピー（クリップボード無しでは値を表示）', async () => {
  const copied = [];
  const h = loaded({ clipboard: { writeText: t => { copied.push(t); return Promise.resolve(); } } });
  // 地図の右クリックは initMap に渡したハンドラを呼ぶ
  h.mapview.handlers.onMapContextMenu({ lat: 35.1234567, lng: 139.7654321 });
  const menu = h.mapview.pointPopup;
  assert.deepEqual(menu.latlng, [35.123457, 139.765432], '6桁に丸める');
  assert.equal(menu.actions.length, 2);

  menu.actions[1].onClick();
  await Promise.resolve();
  assert.deepEqual(copied, ['35.123457, 139.765432']);
  assert.match(h.status(), /コピーしました/);

  menu.actions[0].onClick();
  assert.equal(h.cap.featureEditor.feature.type, 'point');
  assert.deepEqual(h.cap.featureEditor.feature.coordinates, [35.123457, 139.765432]);

  const noClip = loaded();
  noClip.mapview.handlers.onMapContextMenu({ lat: 35, lng: 139 });
  noClip.mapview.pointPopup.actions[1].onClick();
  assert.match(noClip.status(), /コピーできませんでした（座標: 35, 139）/);
});

test('右クリックメニュー: 作図・計測などの最中は開かない', () => {
  const h = loaded();
  h.el('btnMeasureLine').fire('click');
  h.mapview.handlers.onMapContextMenu({ lat: 35, lng: 139 });
  assert.equal(h.mapview.pointPopup, undefined);
});

test('KML書出: 全体と抽出結果をタグ付きで出力する', () => {
  const h = loaded();
  const kml = h.App.exportKML();
  assert.match(kml, /<name>調査<\/name>/);
  assert.equal((kml.match(/<Placemark /g) || []).length, 4);
  assert.match(kml, /<Folder><name>建物<\/name>/);
  const part = h.App.exportKML([h.state.features.get('l1')]);
  assert.equal((part.match(/<Placemark /g) || []).length, 1);
  assert.doesNotMatch(part, /<name>建物<\/name>/);
});

test('印刷: 印刷用の配置にしてから印刷し、印刷後に戻す', () => {
  const h = loaded();
  h.el('btnMeasureLine').fire('click');
  h.el('btnPrint').fire('click');
  assert.deepEqual(h.printed, [true], '印刷時は印刷用の配置');
  assert.equal(h.mapview.measure, null, '進行中の計測は終了');
  assert.match(h.el('printTitle').textContent, /^調査 — /);
  h.winListeners.afterprint();
  assert.equal(h.body.classList.contains('is-printing'), false);
  // ブラウザのメニューから印刷した場合も配置を切り替える
  h.winListeners.beforeprint();
  assert.equal(h.body.classList.contains('is-printing'), true);
  h.winListeners.afterprint();
  assert.equal(h.body.classList.contains('is-printing'), false);
});
