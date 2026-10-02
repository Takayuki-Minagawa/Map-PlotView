'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeApp } = require('./helpers/app-harness');

const YAML = [
  'tags:',
  '  - { id: a, name: A, color: "#111111" }',
  '  - { id: b, name: B, color: "#222222" }',
  'features:',
  '  - { id: p1, type: point, tag: a, name: P1, coordinates: [35, 139] }',
  '  - { id: g1, type: polygon, tag: b, name: G1, coordinates: [[[35, 139], [36, 139], [36, 140], [35, 139]]] }'
].join('\n');

function loaded() {
  const h = makeApp();
  h.App.importText(YAML, 'yaml');
  return h;
}

test('importText: 空の状態へはそのまま読み込み、元に戻すと空へ戻る', () => {
  const h = loaded();
  assert.deepEqual(h.ids(), ['p1', 'g1']);
  assert.deepEqual(h.tagIds(), ['a', 'b']);
  assert.equal(h.el('btnUndo').disabled, false);
  h.App.undo();
  assert.deepEqual(h.ids(), []);
  h.App.redo();
  assert.deepEqual(h.ids(), ['p1', 'g1']);
});

test('importText: 読込でやり直し履歴が破棄される（古い状態がやり直しで復活しない）', () => {
  const h = makeApp();
  h.addTag({ id: 't', name: 'T', color: '#333333' });
  h.App.undo();                       // 空へ戻る。やり直し履歴に「タグtあり」が残る
  assert.equal(h.el('btnRedo').disabled, false);
  h.App.importText(YAML, 'yaml');
  assert.equal(h.el('btnRedo').disabled, true, '読込後はやり直し不可');
  h.App.redo();
  assert.deepEqual(h.ids(), ['p1', 'g1'], '読み込んだデータが消えない');
});

test('importText: 既存データがあるときは追加/置き換えを選べ、どちらも元に戻せる', () => {
  const h = loaded();
  const csv = 'id,name,lat,lng,tag\np1,Dup,35.5,139.5,a\n,New,35.6,139.6,c';

  h.cap.nextChoice = null;            // ダイアログをキャンセル
  h.App.importText(csv, 'csv');
  assert.deepEqual(h.ids(), ['p1', 'g1'], 'キャンセルでは何も変わらない');
  assert.deepEqual(h.cap.chooseOptions.map(o => [o.key, !!o.primary]), [['merge', true], ['replace', false]], 'CSVは追加が既定');

  h.cap.nextChoice = 'merge';
  h.App.importText(csv, 'csv');
  assert.equal(h.ids().length, 4);
  assert.equal(h.state.features.get('p1').name, 'P1', '既存のp1は保持');
  assert.deepEqual(h.tagIds(), ['a', 'b', 'c']);
  assert.equal(h.cap.warnings.length, 1, 'ID衝突の警告');
  h.App.undo();
  assert.deepEqual(h.ids(), ['p1', 'g1']);
  assert.deepEqual(h.cap.warnings, [], '取り消した読込の警告は消す');

  h.cap.nextChoice = 'replace';
  h.App.importText(csv, 'csv');
  assert.equal(h.ids().length, 2);
  assert.deepEqual(h.tagIds(), ['a', 'c']);
  h.App.undo();
  assert.deepEqual(h.ids(), ['p1', 'g1']);
  assert.deepEqual(h.tagIds(), ['a', 'b']);

  h.App.importText(YAML, 'yaml');
  assert.deepEqual(h.cap.chooseOptions.map(o => [o.key, !!o.primary]), [['merge', false], ['replace', true]], 'YAMLは置き換えが既定');
});

test('importText: 構文エラーはalertして状態を変えない', () => {
  const h = loaded();
  h.App.importText('{not json', 'geojson');
  assert.equal(h.alerts.length, 1);
  assert.deepEqual(h.ids(), ['p1', 'g1']);
});

test('タグ削除: 所属フィーチャを未分類へ移し、元に戻すと元のオブジェクトへ戻る', () => {
  const h = loaded();
  const before = h.state.features.get('p1');
  h.cap.ui.onDeleteTag('a');
  assert.equal(h.state.features.get('p1').tag, '__uncategorized__');
  assert.equal(before.tag, 'a', '履歴が参照する元オブジェクトは書き換えない');
  assert.ok(h.state.tags.has('__uncategorized__'));
  h.App.undo();
  assert.equal(h.state.features.get('p1'), before);
  assert.deepEqual(h.tagIds(), ['a', 'b']);
  assert.deepEqual(h.ids(), ['p1', 'g1'], '並び順も元どおり');
});

test('削除の確認をキャンセルしたら履歴を積まない', () => {
  const h = makeApp();
  h.App.importText(YAML, 'yaml');
  h.App.undo(); h.App.redo();          // undo可能・redo不可の状態にする
  h.cap.confirm = false;
  h.cap.ui.onDeleteTag('a');
  h.cap.detail.onDelete({ id: 'p1' });
  assert.deepEqual(h.ids(), ['p1', 'g1']);
  h.App.undo();
  assert.deepEqual(h.ids(), [], '直前の履歴は読込のまま');
});

test('フィーチャ編集・削除・表示項目の保存が元に戻せる', () => {
  const h = loaded();
  h.cap.ui.onSelectFeature('p1');
  h.cap.detail.onEdit(h.state.features.get('p1'));
  h.cap.featureEditor.onSave(Object.assign({}, h.state.features.get('p1'), { name: 'Renamed' }), false);
  assert.equal(h.state.features.get('p1').name, 'Renamed');
  assert.equal(h.cap.detailObj.current.name, 'Renamed', '詳細ビューも更新');

  h.cap.detail.onSaveProperty(h.state.features.get('p1'), '標高(m)', 3.5);
  assert.deepEqual(h.state.features.get('p1').properties, { '標高(m)': 3.5 });

  h.cap.detail.onDelete({ id: 'p1' });
  assert.deepEqual(h.ids(), ['g1']);
  assert.equal(h.cap.detailObj.current, null);

  h.App.undo();
  assert.deepEqual(h.ids(), ['p1', 'g1'], '削除を戻すと並び順も元どおり');
  h.App.undo();
  assert.equal(h.state.features.get('p1').properties, undefined);
  h.App.undo();
  assert.equal(h.state.features.get('p1').name, 'P1');
});

test('作図: 保存で確定しキャンセルで破棄、タグが無ければ未分類を実体化する', () => {
  const h = makeApp();
  h.el('btnAddPoint').fire('click');
  assert.equal(h.mapview.drawEnabled, true);
  h.mapview.map.handlers['pm:create']({ layer: { coords: [35, 139] } });
  assert.equal(h.mapview.drawEnabled, false, '作図セッション終了');
  const ed = h.cap.featureEditor;
  assert.equal(ed.ctx.isNew, true);
  assert.equal(ed.feature.id, 'p001');
  assert.deepEqual(ed.tags.map(t => t.id), ['__uncategorized__'], 'タグ0件なら未分類を候補に出す');
  assert.equal(h.state.tags.size, 0, '保存前はstateへ登録しない');

  ed.onCancel();
  assert.deepEqual(h.ids(), []);
  assert.equal(h.mapview.layers.size, 0, 'プレビューを破棄');
  assert.equal(h.el('btnUndo').disabled, true);

  h.el('btnAddPoint').fire('click');
  h.mapview.map.handlers['pm:create']({ layer: { coords: [35, 139] } });
  h.cap.featureEditor.onSave(Object.assign({}, h.cap.featureEditor.feature, { name: 'X' }), true);
  assert.deepEqual(h.ids(), ['p001']);
  assert.deepEqual(h.tagIds(), ['__uncategorized__']);
  h.App.undo();
  assert.deepEqual(h.ids(), []);
  assert.deepEqual(h.tagIds(), [], '未分類タグの追加も一緒に戻る');
});

test('形状編集: 変更は確定で保存、変更なし・不正な形状は元のまま', () => {
  const h = loaded();
  const g1 = h.state.features.get('g1');

  // 変更なし（保存済みは閉じたリング、地図側は開いたリングを返す）
  h.cap.detail.onReshape(g1);
  assert.equal(h.mapview._editingId, 'g1');
  assert.equal(h.el('editBar').hidden, false);
  h.mapview.editedCoords = [[[35, 139], [36, 139], [36, 140]]];
  h.el('btnReshapeDone').fire('click');
  assert.equal(h.state.features.get('g1'), g1, '変更なしなら差し替えない');
  assert.equal(h.el('editBar').hidden, true);
  h.App.undo();
  assert.deepEqual(h.ids(), [], '履歴は読込だけ（形状編集の分は積まれていない）');
  h.App.redo();

  // 不正な形状（緯度範囲外）
  h.cap.detail.onReshape(g1);
  h.mapview.editedCoords = [[[95, 139], [36, 139], [36, 140]]];
  h.el('btnReshapeDone').fire('click');
  assert.equal(h.alerts.length, 1);
  assert.equal(h.state.features.get('g1'), g1);

  // 変更あり
  h.cap.detail.onReshape(g1);
  h.mapview.editedCoords = [[[35, 139], [36, 139], [36.5, 140.5]]];
  h.el('btnReshapeDone').fire('click');
  assert.deepEqual(h.state.features.get('g1').coordinates, [[[35, 139], [36, 139], [36.5, 140.5]]]);
  assert.equal(h.mapview._editingId, null);
  h.App.undo();
  assert.equal(h.state.features.get('g1'), g1);
});

test('形状編集: 非表示のプロットは開始できず、キャンセルで元へ戻る', () => {
  const h = loaded();
  h.cap.ui.onToggleTag('b', false);
  h.cap.detail.onReshape(h.state.features.get('g1'));
  assert.equal(h.mapview._editingId, null);
  assert.notEqual(h.status(), '');

  h.cap.ui.onToggleTag('b', true);
  h.cap.detail.onReshape(h.state.features.get('g1'));
  h.mapview.editedCoords = [[[1, 1], [2, 2], [3, 3]]];
  h.el('btnReshapeCancel').fire('click');
  assert.equal(h.mapview._editingId, null);
  assert.equal(h.state.features.get('g1').coordinates[0].length, 4, '保存済みの座標のまま');
});

test('セッション中は元に戻す/やり直しを受け付けない（作業中の内容を巻き込まない）', () => {
  const h = loaded();
  h.cap.detail.onReshape(h.state.features.get('g1'));
  h.App.undo();
  assert.deepEqual(h.ids(), ['p1', 'g1'], '読込は取り消されない');
  assert.equal(h.mapview._editingId, 'g1', '形状編集は続いている');
  assert.notEqual(h.status(), '');

  h.key({ key: 'Escape' });
  assert.equal(h.mapview._editingId, null);
  h.App.undo();
  assert.deepEqual(h.ids(), []);

  // やり直しも、作図・矩形選択の最中は受け付けない
  h.el('btnAddPoint').fire('click');
  h.App.redo();
  assert.deepEqual(h.ids(), []);
  h.key({ key: 'Escape' });
  h.el('btnRectSelect').fire('click');
  h.App.redo();
  assert.deepEqual(h.ids(), []);
  h.key({ key: 'Escape' });
  h.App.redo();
  assert.deepEqual(h.ids(), ['p1', 'g1']);
});

test('キー操作: 作図中のCtrl+Zは頂点の取消、通常時は元に戻す、入力欄と変換中は無視', () => {
  const h = loaded();
  h.el('btnAddLine').fire('click');
  h.key({ key: 'z', ctrlKey: true });
  assert.equal(h.mapview.map.pm.Draw.Line.removed, 1);
  assert.deepEqual(h.ids(), ['p1', 'g1'], '作図中は履歴を戻さない');
  h.key({ key: 'Escape' });
  assert.equal(h.mapview.drawEnabled, false);

  h.key({ key: 'z', ctrlKey: true, target: { tagName: 'INPUT', type: 'text' } });
  assert.deepEqual(h.ids(), ['p1', 'g1'], '入力欄ではブラウザ標準の動作に任せる');
  h.key({ key: 'z', ctrlKey: true, isComposing: true });
  assert.deepEqual(h.ids(), ['p1', 'g1']);

  h.key({ key: 'z', metaKey: true, target: { tagName: 'INPUT', type: 'checkbox' } });
  assert.deepEqual(h.ids(), [], 'チェックボックスにフォーカスがあっても効く');
  h.key({ key: 'Z', ctrlKey: true, shiftKey: true });
  assert.deepEqual(h.ids(), ['p1', 'g1'], 'Ctrl+Shift+Zでやり直し');
  h.key({ key: 'z', ctrlKey: true });
  h.key({ key: 'y', ctrlKey: true });
  assert.deepEqual(h.ids(), ['p1', 'g1'], 'Ctrl+Yでやり直し');
});

test('キー操作: 形状編集中のEnterで確定（ボタンにフォーカスがあるときは二重実行しない）', () => {
  const h = loaded();
  h.cap.detail.onReshape(h.state.features.get('p1'));
  h.mapview.editedCoords = [35.1, 139.1];
  h.key({ key: 'Enter', target: { tagName: 'BUTTON' } });
  assert.equal(h.mapview._editingId, 'p1', 'ボタン上のEnterはボタン自身に任せる');
  h.key({ key: 'Enter', target: { tagName: 'DIV' } });
  assert.deepEqual(h.state.features.get('p1').coordinates, [35.1, 139.1]);
});

test('矩形選択: 完了で抽出結果を更新し、削除したフィーチャは結果から外れる', () => {
  const h = loaded();
  h.el('btnRectSelect').fire('click');
  assert.equal(typeof h.mapview.rectDone, 'function');
  h.key({ key: 'Escape' });
  assert.equal(h.mapview.rectDone, null, 'Escで中断');

  h.el('btnRectSelect').fire('click');
  h.mapview.rectDone({
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [[[138, 34], [141, 34], [141, 37], [138, 37], [138, 34]]] },
    bbox: [138, 34, 141, 37]
  });
  assert.deepEqual(h.cap.selectionList.map(f => f.id), ['p1', 'g1']);
  assert.equal(h.el('editBar').hidden, true, '完了したら操作バーを隠す');
  assert.equal(h.el('btnUndo').disabled, false, '履歴ボタンも使える状態へ戻る');
  h.cap.detail.onDelete({ id: 'p1' });
  assert.deepEqual(h.cap.selectionList.map(f => f.id), ['g1']);
  h.App.undo();
  assert.deepEqual(h.App.selectionFeatures().map(f => f.id), ['g1'], '選択は履歴の対象外（戻したp1は再選択されない）');
});

test('自動保存: 変更のたびに退避し、起動時に復元できる', () => {
  const h = loaded();
  assert.ok(h.store['mpv:autosave'].includes('p1'));
  const h2 = makeApp({ autosaved: h.store['mpv:autosave'] });
  assert.deepEqual(h2.ids(), ['p1', 'g1']);
  assert.equal(h2.el('btnUndo').disabled, true, '復元は履歴に積まない');
});

test('自動保存: 失敗は後続のステータスで上書きされず、成功したら消える', () => {
  const h = loaded();
  h.quota.fail = true;
  h.cap.detail.onSaveProperty(h.state.features.get('p1'), 'k', 1);
  const warn = h.status();
  assert.ok(warn.includes('自動保存できませんでした'), warn);
  h.App.undo();
  assert.ok(h.status().includes('元に戻しました'));
  assert.ok(h.status().includes('自動保存できませんでした'), '失敗の表示が残る');
  h.quota.fail = false;
  h.App.redo();
  assert.ok(!h.status().includes('自動保存できませんでした'));
});

test('詳細を閉じると選択が解除される', () => {
  const h = loaded();
  h.cap.ui.onSelectFeature('p1');
  assert.equal(h.state.activeFeatureId, 'p1');
  h.cap.detail.onClose();
  assert.equal(h.state.activeFeatureId, null);
  assert.equal(h.cap.detailObj.current, null);
});

test('操作バー: セッション中だけ表示し、確定は形状編集のときだけ出す。履歴ボタンは無効化する', () => {
  const h = loaded();
  assert.equal(h.el('btnUndo').disabled, false);

  h.el('btnAddLine').fire('click');
  assert.equal(h.el('editBar').hidden, false);
  assert.equal(h.el('btnReshapeDone').hidden, true, '作図に確定ボタンは出さない');
  assert.equal(h.el('editBarLabel').textContent, '作図中');
  assert.equal(h.el('btnUndo').disabled, true);
  h.el('btnReshapeCancel').fire('click');
  assert.equal(h.mapview.drawEnabled, false, 'キャンセルで作図を中止');
  assert.equal(h.el('editBar').hidden, true);
  assert.equal(h.el('btnUndo').disabled, false);

  h.el('btnRectSelect').fire('click');
  assert.equal(h.el('editBarLabel').textContent, '範囲を選択中');
  h.el('btnReshapeCancel').fire('click');
  assert.equal(h.mapview.rectDone, null);
  assert.equal(h.el('editBar').hidden, true);

  h.cap.detail.onReshape(h.state.features.get('p1'));
  assert.equal(h.el('btnReshapeDone').hidden, false);
  assert.equal(h.el('editBarLabel').textContent, '形状を編集中');
});

test('作図: 範囲外の座標を含む形状は追加しない', () => {
  const h = loaded();
  h.el('btnAddLine').fire('click');
  h.mapview.map.handlers['pm:create']({ layer: { coords: [[35, 179], [35, 181]] } });
  assert.equal(h.alerts.length, 1);
  assert.deepEqual(h.ids(), ['p1', 'g1']);
  assert.equal(h.mapview.layers.has('l001'), false, 'プレビューも残さない');
});
