/* app.js — 状態管理の中心 / 各モジュール結線 / 入出力 */
(function (global) {
  'use strict';

  var LS_KEY = 'mpv:autosave';
  var HISTORY_LIMIT = 50;

  /* tags / features の各オブジェクトは書き換えず、変更時は新しいオブジェクトへ差し替える。
   * 元に戻す履歴（スナップショット）が参照を共有するため。 */
  var state = {
    meta: {},
    tags: new Map(),          // id -> tag
    features: new Map(),      // id -> feature
    hiddenTags: new Set(),    // 非表示タグ
    selection: { rect: null, ids: [] },
    activeFeatureId: null
  };

  var mapview, detail, ui;
  var undoHistory = new global.UndoHistory(HISTORY_LIMIT);
  var selectMode = 'intersect';
  var respectHidden = true;
  var mapOnlyMode = false;
  var searchQuery = '';
  var drawCreateHandler = null;  // 現在の作図セッションの pm:create ハンドラ
  var rectCleanup = null;        // 現在の矩形選択セッションの解除関数
  var geomEditId = null;         // 形状編集中のfeatureId
  var placeSearchSeq = 0;        // 場所検索の世代番号（古い応答を捨てる）
  var Store = global.Store;
  var UNCAT = Store.UNCATEGORIZED_ID;
  var tr = function (key, vars) { return global.I18n ? global.I18n.t(key, vars) : key; };

  function tagsArray() { return Array.from(state.tags.values()); }
  function featuresArray() { return Array.from(state.features.values()); }
  function tagsById() {
    var o = {}; state.tags.forEach(function (t, k) { o[k] = t; }); return o;
  }
  function isHidden(feature) { return state.hiddenTags.has(feature.tag); }

  function boot() {
    if (global.I18n) global.I18n.init();

    mapview = new global.MapView();
    mapview.initMap(document.getElementById('map'), Store.DEFAULT_VIEW, {
      onFeatureClick: selectFeature
    });

    detail = new global.Detail(document.getElementById('detail'), {
      onFocus: function (f) { mapview.focusFeature(f.id); },
      onReshape: function (f) { beginGeometryEdit(f.id); },
      onEdit: function (f) { editFeature(f); },
      onDelete: function (f) { deleteFeature(f.id); },
      onSaveProperty: saveFeatureProperty
    });
    detail.clearDetail();

    ui = new global.UI({
      tagList: document.getElementById('tagList'),
      featureList: document.getElementById('featureList'),
      selectionList: document.getElementById('selectionList'),
      selectionCount: document.getElementById('selectionCount'),
      searchResults: document.getElementById('placeResults'),
      warnings: document.getElementById('warnings')
    }, {
      onToggleTag: toggleTag,
      onEditTag: function (t) { ui.openTagEditor(t, saveTag); },
      onDeleteTag: deleteTag,
      onSelectFeature: selectFeature,
      onPickSearchResult: showSearchResult
    });

    wireToolbar();
    wireDropZone();
    if (global.I18n) {
      global.I18n.subscribe(function () {
        syncSystemTagLabels();
        if (mapview.map && mapview.map.closePopup) mapview.map.closePopup();
        mapview.clearSearchMarker(); // ポップアップ内のボタン文言が旧言語のまま残るため
        setStatus('');               // 旧言語のステータス文言を残さない
        refreshAll();
        syncMapOnlyControls();
      });
    }
    syncLayerControls();
    renderAll();
    updateHistoryButtons();
    restoreAutosave();
  }

  /* ---- 入出力 ---- */

  /* テキストを解析して取り込む。既にデータがあれば「追加 / 置き換え」を選ばせる。 */
  function importText(text, format) {
    var parsed;
    try {
      parsed = Store.parseText(format, text);
    } catch (e) {
      alert(tr('loadError', { message: e.message }));
      return;
    }
    if (!state.features.size && !state.tags.size) {
      applyParsed(parsed);
      return;
    }
    // プロジェクト全体を表すYAMLは置き換え、部品として持ち込むGeoJSON/CSVは追加を既定にする
    var preferMerge = format !== 'yaml';
    global.UI.choose(tr('importTitle'),
      tr('importMessage', { current: state.features.size, incoming: parsed.features.length }),
      [
        { key: 'merge', label: tr('importMerge'), primary: preferMerge },
        { key: 'replace', label: tr('importReplace'), primary: !preferMerge }
      ],
      function (key) {
        recordHistory();
        if (key === 'merge') mergeParsed(parsed);
        else applyParsed(parsed);
      });
  }

  /* パース済みデータで現在のデータを置き換える。parsed.viewがnullなら全体が収まる位置へ移動。 */
  function applyParsed(parsed) {
    cancelSessions();
    state.meta = parsed.meta || {};
    setData(parsed.tags, parsed.features);
    state.hiddenTags = new Set();
    mapview.clearSelectionRect();
    state.selection = { rect: null, ids: [] };
    state.activeFeatureId = null;

    if (parsed.view) applyView(parsed.view);
    refreshAll();
    if (!parsed.view) mapview.fitAllFeatures();
    ui.showWarnings(parsed.warnings);
    autosave();
  }

  /* パース済みデータを現在のデータへ追加する（表示位置・meta・既存タグ定義は維持） */
  function mergeParsed(parsed) {
    cancelSessions();
    var merged = Store.mergeData({ tags: tagsArray(), features: featuresArray() }, parsed);
    setData(merged.tags, merged.features);
    refreshAll();
    mapview.fitAllFeatures();
    ui.showWarnings(merged.warnings);
    autosave();
  }

  function setData(tags, features) {
    state.tags = new Map();
    tags.forEach(function (t) { state.tags.set(t.id, t); });
    syncSystemTagLabels();
    state.features = new Map();
    features.forEach(function (f) { state.features.set(f.id, f); });
  }

  function applyView(view) {
    mapview.map.setView(view.center, view.zoom);
    if (view.baseLayer) mapview.setBaseLayer(view.baseLayer);
    Object.keys(global.MapView.OVERLAY_DEFS).forEach(function (k) {
      mapview.toggleOverlay(k, (view.overlays || []).indexOf(k) !== -1);
    });
    mapview.setOverlayOpacity(view.overlayOpacity != null ? view.overlayOpacity : global.MapView.DEFAULT_OVERLAY_OPACITY);
    syncLayerControls();
  }

  function exportYaml(features) {
    var snap = {
      meta: state.meta,
      view: mapview.getView(),
      tags: tagsArray(),
      features: features || featuresArray()
    };
    return Store.dumpYaml(snap);
  }

  function exportGeoJSON(features) {
    return JSON.stringify(global.UI.toGeoJSONCollection(features || featuresArray()), null, 2);
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = global.Util.decodeText(reader.result);
      importText(text, Store.detectFormat(file.name, text));
    };
    reader.onerror = function () {
      alert(tr('loadError', { message: (reader.error && reader.error.message) || file.name }));
    };
    reader.readAsArrayBuffer(file);
  }

  function selectionFeatures() {
    return state.selection.ids.map(function (id) { return state.features.get(id); }).filter(Boolean);
  }

  /* 検索クエリに一致するフィーチャ（名称/ID/タグ名/タグID、部分一致・大小無視） */
  function filteredFeatures() {
    var q = searchQuery.trim().toLowerCase();
    if (!q) return featuresArray();
    var byId = tagsById();
    return featuresArray().filter(function (f) {
      var tag = byId[f.tag];
      // YAML由来の数値ID等に備えStringで正規化
      return String(f.name || '').toLowerCase().indexOf(q) !== -1 ||
        String(f.id || '').toLowerCase().indexOf(q) !== -1 ||
        String(f.tag || '').toLowerCase().indexOf(q) !== -1 ||
        (tag && String(tag.name || '').toLowerCase().indexOf(q) !== -1);
    });
  }

  /* ---- 元に戻す / やり直し ---- */
  function snapshot() {
    return { meta: state.meta, tags: tagsArray(), features: featuresArray() };
  }

  /* データを変更する直前に呼ぶ */
  function recordHistory() {
    undoHistory.record(snapshot());
    updateHistoryButtons();
  }

  function restoreSnapshot(snap) {
    cancelSessions();
    state.meta = snap.meta;
    setData(snap.tags, snap.features);
    state.hiddenTags.forEach(function (id) {
      if (!state.tags.has(id)) state.hiddenTags.delete(id);
    });
    state.selection.ids = state.selection.ids.filter(function (id) { return state.features.has(id); });
    if (!state.features.has(state.activeFeatureId)) state.activeFeatureId = null;
    refreshAll();
    updateHistoryButtons();
    autosave();
  }

  function undo() {
    if (!undoHistory.canUndo()) return;
    restoreSnapshot(undoHistory.undo(snapshot()));
    setStatus(tr('undone'));
  }

  function redo() {
    if (!undoHistory.canRedo()) return;
    restoreSnapshot(undoHistory.redo(snapshot()));
    setStatus(tr('redone'));
  }

  function updateHistoryButtons() {
    var u = document.getElementById('btnUndo');
    var r = document.getElementById('btnRedo');
    if (u) u.disabled = !undoHistory.canUndo();
    if (r) r.disabled = !undoHistory.canRedo();
  }

  /* ---- 描画 ---- */
  function redrawFeatures() {
    cancelGeometryEdit(); // レイヤを作り直すので編集中の形状は破棄する
    mapview.clearFeatures();
    var byId = tagsById();
    featuresArray().forEach(function (f) {
      mapview.renderFeature(f, byId[f.tag]);
      mapview.setFeatureVisible(f.id, !isHidden(f));
    });
  }

  /* 1フィーチャのレイヤを現在のstateから作り直す */
  function rerenderFeature(f) {
    mapview.removeFeature(f.id);
    mapview.renderFeature(f, state.tags.get(f.tag));
    mapview.setFeatureVisible(f.id, !isHidden(f));
  }

  function renderLists() {
    ui.renderFeatureList(filteredFeatures(), tagsById(), state.activeFeatureId);
    ui.renderSelectionList(selectionFeatures(), tagsById(), state.activeFeatureId);
  }

  function renderAll() {
    ui.renderTagList(tagsArray(), state.hiddenTags);
    renderLists();
  }

  function showActiveDetail() {
    var f = state.features.get(state.activeFeatureId);
    if (f) detail.showDetail(f, state.tags.get(f.tag), state.meta);
    else detail.clearDetail();
  }

  /* 地図・一覧・詳細をstateから描き直す */
  function refreshAll() {
    redrawFeatures();
    renderAll();
    showActiveDetail();
  }

  /* ---- 操作 ---- */
  function selectFeature(id) {
    var f = state.features.get(id);
    if (!f) return;
    state.activeFeatureId = id;
    showActiveDetail();
    mapview.focusFeature(id);
    renderLists();
  }

  function toggleTag(tagId, visible) {
    cancelGeometryEdit();
    if (visible) state.hiddenTags.delete(tagId);
    else state.hiddenTags.add(tagId);
    featuresArray().forEach(function (f) {
      if (f.tag === tagId) mapview.setFeatureVisible(f.id, visible);
    });
    ui.renderTagList(tagsArray(), state.hiddenTags);
    autosave();
  }

  function saveTag(tag, isNew) {
    if (isNew && state.tags.has(tag.id)) {
      alert(tr('tagIdExists', { id: tag.id }));
      return false; // モーダルを閉じずに再入力へ
    }
    recordHistory();
    state.tags.set(tag.id, tag);
    refreshAll();
    autosave();
  }

  function deleteTag(tagId) {
    if (!confirm(tr('deleteTagConfirm', { id: tagId }))) return;
    recordHistory();
    state.tags.delete(tagId);
    state.hiddenTags.delete(tagId);
    var orphaned = featuresArray().filter(function (f) { return f.tag === tagId; });
    if (orphaned.length && !state.tags.has(UNCAT)) state.tags.set(UNCAT, Store.uncategorizedTag());
    orphaned.forEach(function (f) {
      state.features.set(f.id, Object.assign({}, f, { tag: UNCAT }));
    });
    refreshAll();
    autosave();
  }

  /* フィーチャの保存確定：履歴記録・state登録・再描画・詳細更新・自動退避 */
  function commitFeature(nf) {
    recordHistory();
    if (!state.tags.has(nf.tag) && nf.tag === UNCAT) state.tags.set(UNCAT, Store.uncategorizedTag());
    state.features.set(nf.id, nf);
    rerenderFeature(nf);
    renderAll();
    if (state.activeFeatureId === nf.id) showActiveDetail();
    autosave();
  }

  /* 編集モーダルに出すタグ候補。タグが1つも無いときは「未分類」を仮に出す（保存時に実体化）。 */
  function editorTags() {
    return state.tags.size ? tagsArray() : [Store.uncategorizedTag()];
  }

  function editFeature(f) {
    cancelSessions();
    ui.openFeatureEditor(f, editorTags(), { meta: state.meta }, commitFeature);
  }

  function deleteFeature(id) {
    if (!confirm(tr('deleteFeatureConfirm'))) return;
    cancelSessions();
    recordHistory();
    state.features.delete(id);
    mapview.removeFeature(id);
    state.selection.ids = state.selection.ids.filter(function (x) { return x !== id; });
    if (state.activeFeatureId === id) { state.activeFeatureId = null; detail.clearDetail(); }
    renderAll();
    autosave();
  }

  /* 詳細ビューから表示項目を1つ保存する（標高など） */
  function saveFeatureProperty(feature, key, value) {
    var f = state.features.get(feature.id);
    if (!f) return;
    cancelSessions();
    var props = Object.assign({}, f.properties);
    props[key] = value;
    commitFeature(Object.assign({}, f, { properties: props }));
    setStatus(tr('propertySaved', { key: key }));
  }

  /* ---- セッション（作図 / 矩形選択 / 形状編集）は同時に1つだけ ---- */
  function cancelSessions() {
    cancelDraw();
    cancelRectSelect();
    cancelGeometryEdit();
  }

  /* ---- 作図（Geomanがあれば利用） ---- */
  function addFeatureByType(type) {
    if (!mapview.map.pm) {
      alert(tr('drawToolMissing'));
      return;
    }
    // 既存のセッションを解除してから開始（ハンドラ積み増しを防止）
    cancelSessions();
    var shape = { point: 'Marker', line: 'Line', polygon: 'Polygon' }[type];
    drawCreateHandler = function (e) {
      var coords = global.MapView.layerToCoords(type, e.layer);
      mapview.map.removeLayer(e.layer); // 一旦削除し内部管理レイヤとして再生成
      cancelDraw();                     // セッション終了（disableDraw + off）
      openNewFeature(type, coords, '');
    };
    mapview.map.on('pm:create', drawCreateHandler);
    mapview.map.pm.enableDraw(shape, { snappable: true });
  }

  /* 未確定の新規フィーチャをプレビュー描画して編集モーダルを開く。
   * 確定前は state に登録しない。保存で確定、キャンセルで破棄。 */
  function openNewFeature(type, coords, name) {
    var f = {
      id: Store.nextFreeId(type, state.features),
      type: type,
      tag: state.tags.size ? tagsArray()[0].id : UNCAT,
      name: name || '',
      coordinates: coords,
      properties: {}
    };
    mapview.renderFeature(f, state.tags.get(f.tag));
    ui.openFeatureEditor(f, editorTags(), { meta: state.meta, isNew: true }, function (nf) {
      mapview.removeFeature(f.id);     // プレビュー除去（IDが変更された場合に備え元IDで）
      commitFeature(nf);
    }, function () {
      mapview.removeFeature(f.id);     // キャンセル：プレビュー破棄（state未登録）
    });
  }

  function cancelDraw() {
    if (drawCreateHandler && mapview.map.pm) {
      mapview.map.off('pm:create', drawCreateHandler);
      mapview.map.pm.disableDraw();
    }
    drawCreateHandler = null;
  }

  function cancelRectSelect() {
    if (rectCleanup) { rectCleanup(); rectCleanup = null; }
  }

  function syncSystemTagLabels() {
    var tag = state.tags.get(UNCAT);
    if (tag) tag.name = tr('uncategorized'); // 表示言語に追従する派生ラベルのためin-placeで更新
  }

  /* ---- 形状編集 ---- */
  function beginGeometryEdit(id) {
    var f = state.features.get(id);
    if (!f) return;
    if (!mapview.map.pm) {
      alert(tr('drawToolMissing'));
      return;
    }
    cancelSessions();
    if (!mapview.startGeometryEdit(id)) {
      setStatus(tr('reshapeHidden'));
      return;
    }
    geomEditId = id;
    showEditBar(true);
    setStatus(tr(f.type === 'point' ? 'reshapeHintPoint' : 'reshapeHintShape'));
  }

  /* 編集結果を確定する。不正な形状（頂点不足など）や変更なしの場合は元へ戻す。 */
  function finishGeometryEdit() {
    if (geomEditId == null) return;
    var f = state.features.get(geomEditId);
    var coords = f ? mapview.getEditedCoords(f.type) : null;
    endGeometryEdit();
    if (!f) return;
    var nf = Object.assign({}, f, { coordinates: coords });
    var v = Store.validateFeature(nf);
    if (!v.ok) {
      rerenderFeature(f);
      setStatus('');
      alert(tr('reshapeInvalid', { errors: v.errors.join(' / ') }));
      return;
    }
    if (JSON.stringify(coords) === JSON.stringify(roundDeep(f.coordinates))) {
      rerenderFeature(f);
      setStatus('');
      return;
    }
    commitFeature(nf);
    setStatus(tr('reshapeSaved'));
  }

  function cancelGeometryEdit() {
    if (geomEditId == null) return;
    var f = state.features.get(geomEditId);
    endGeometryEdit();
    if (f) rerenderFeature(f);
    setStatus('');
  }

  function endGeometryEdit() {
    mapview.stopGeometryEdit();
    geomEditId = null;
    showEditBar(false);
  }

  function showEditBar(visible) {
    var bar = document.getElementById('editBar');
    if (bar) bar.hidden = !visible;
  }

  function roundDeep(c) {
    return Array.isArray(c) ? c.map(roundDeep) : round(c);
  }

  /* ---- 矩形範囲抽出（R9） ---- */
  function beginRectSelect() {
    // 進行中のセッションを解除（リスナ積み増し・残留矩形を防止）
    cancelSessions();
    setStatus(tr('dragRect'));
    rectCleanup = mapview.startRectangleSelect(function (rectGeoJSON) {
      rectCleanup = null; // ドラッグ完了でセッション終了（内部cleanupは実行済み）
      state.selection.rect = rectGeoJSON;
      var ids = global.Select.selectInBounds(rectGeoJSON, featuresArray(), {
        mode: selectMode,
        respectHidden: respectHidden,
        isHidden: isHidden
      });
      state.selection.ids = ids;
      ui.renderSelectionList(selectionFeatures(), tagsById(), state.activeFeatureId);
      setStatus(tr('selectedStatus', { count: ids.length, mode: tr(selectMode === 'within' ? 'within' : 'intersect') }));
    });
  }

  function clearSelection() {
    cancelRectSelect();
    mapview.clearSelectionRect();
    state.selection = { rect: null, ids: [] };
    ui.renderSelectionList([], tagsById(), state.activeFeatureId);
    setStatus('');
  }

  /* ---- 場所検索 ---- */
  function runPlaceSearch(query) {
    var q = String(query || '').trim();
    var seq = ++placeSearchSeq;
    if (!q) {
      ui.renderSearchResults([]);
      mapview.clearSearchMarker();
      return;
    }
    var latlng = global.Geo.parseLatLngQuery(q);
    if (latlng) {
      ui.renderSearchResults([]);
      showSearchResult({ title: q, lat: latlng[0], lng: latlng[1] });
      return;
    }
    ui.renderSearchResults(null, tr('searching'));
    global.Geo.searchAddress(q).then(function (results) {
      if (seq !== placeSearchSeq) return; // より新しい検索が始まっている
      if (!results.length) {
        ui.renderSearchResults(null, tr('searchNoResult'));
        return;
      }
      ui.renderSearchResults(results);
      if (results.length === 1) showSearchResult(results[0]);
    }).catch(function (e) {
      if (seq !== placeSearchSeq) return;
      ui.renderSearchResults(null, tr('searchError', { message: e.message }));
    });
  }

  /* 検索地点へ移動し、その場所を点として追加できるポップアップを出す */
  function showSearchResult(r) {
    mapview.showSearchMarker([r.lat, r.lng], r.title, {
      label: tr('addPointHere'),
      onClick: function () {
        mapview.clearSearchMarker();
        cancelSessions();
        openNewFeature('point', [round(r.lat), round(r.lng)], r.title);
      }
    });
  }

  /* ---- ツールバー結線 ---- */
  function wireToolbar() {
    on('btnLoad', 'click', function () { document.getElementById('fileInput').click(); });
    on('fileInput', 'change', function (e) {
      var file = e.target.files[0];
      if (file) loadFile(file);
      e.target.value = '';
    });
    on('btnSaveYaml', 'click', function () { download('map-data.yaml', exportYaml(), 'text/yaml;charset=utf-8'); });
    on('btnSaveGeo', 'click', function () { download('map-data.geojson', exportGeoJSON(), 'application/geo+json'); });
    on('btnLoadSample', 'click', loadSample);
    on('btnUndo', 'click', undo);
    on('btnRedo', 'click', redo);
    on('btnMapOnlyToggle', 'click', function () { setMapOnlyMode(!mapOnlyMode); });
    on('btnMapOnlyRestore', 'click', function () { setMapOnlyMode(false); });

    on('btnAddTag', 'click', function () { ui.openTagEditor(null, saveTag); });
    on('btnAddPoint', 'click', function () { addFeatureByType('point'); });
    on('btnAddLine', 'click', function () { addFeatureByType('line'); });
    on('btnAddPolygon', 'click', function () { addFeatureByType('polygon'); });

    on('btnRectSelect', 'click', beginRectSelect);
    on('btnClearSelect', 'click', clearSelection);
    on('selMode', 'change', function (e) { selectMode = e.target.value; });
    on('chkRespectHidden', 'change', function (e) { respectHidden = e.target.checked; });

    on('btnExportSelYaml', 'click', function () {
      download('selection.yaml', exportYaml(selectionFeatures()), 'text/yaml;charset=utf-8');
    });
    on('btnExportSelGeo', 'click', function () {
      download('selection.geojson', exportGeoJSON(selectionFeatures()), 'application/geo+json');
    });
    on('btnExportSelCsv', 'click', function () {
      // BOM付与でExcelの文字化けを防ぐ
      download('selection.csv', '﻿' + global.UI.toCSV(selectionFeatures()), 'text/csv;charset=utf-8');
    });

    on('btnFitAll', 'click', function () { mapview.fitAllFeatures(); });
    on('featureSearch', 'input', function (e) {
      searchQuery = e.target.value;
      ui.renderFeatureList(filteredFeatures(), tagsById(), state.activeFeatureId);
    });

    // 場所検索・現在地
    on('placeSearchForm', 'submit', function (e) {
      e.preventDefault();
      runPlaceSearch(document.getElementById('placeSearch').value);
    });
    on('placeSearch', 'input', function (e) {
      if (!e.target.value) runPlaceSearch(''); // 入力を消したら候補とマーカーも片付ける
    });
    on('btnLocate', 'click', function () {
      setStatus(tr('locating'));
      mapview.locate(
        function () { setStatus(''); },
        function (err) { setStatus(tr('locateError', { message: (err && err.message) || '' })); });
    });

    // 形状編集バー
    on('btnReshapeDone', 'click', finishGeometryEdit);
    on('btnReshapeCancel', 'click', cancelGeometryEdit);

    // 背景レイヤ・オーバーレイ
    document.querySelectorAll('input[name="base"]').forEach(function (r) {
      r.addEventListener('change', function () { mapview.setBaseLayer(r.value); autosave(); });
    });
    document.querySelectorAll('input[data-overlay]').forEach(function (c) {
      c.addEventListener('change', function () { mapview.toggleOverlay(c.getAttribute('data-overlay'), c.checked); autosave(); });
    });
    on('overlayOpacity', 'input', function (e) { mapview.setOverlayOpacity(e.target.value / 100); });
    on('overlayOpacity', 'change', autosave);

    document.addEventListener('keydown', onKeyDown);
    syncMapOnlyControls();
  }

  function onKeyDown(e) {
    if (document.querySelector('.mpv-modal, .mpv-lightbox')) return; // モーダル表示中は干渉しない
    var mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    var key = String(e.key || '').toLowerCase();
    if (mod && (key === 'z' || key === 'y')) {
      if (isTextEntry(e.target)) return; // 入力欄ではブラウザ標準の取り消しを優先
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo();
      else undo();
      return;
    }
    if (key === 'enter' && geomEditId != null && !mod && !isTextEntry(e.target) && !isActivatable(e.target)) {
      e.preventDefault();
      finishGeometryEdit();
      return;
    }
    if (key !== 'escape') return;
    if (geomEditId != null) { cancelGeometryEdit(); return; }
    if (drawCreateHandler) { cancelDraw(); setStatus(''); return; }
    if (rectCleanup) { cancelRectSelect(); setStatus(''); return; }
    if (mapOnlyMode) setMapOnlyMode(false);
  }

  /* 文字入力を受け付ける要素か（チェックボックス等のinputは除く） */
  function isTextEntry(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    var tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    return ['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset'].indexOf(el.type) === -1;
  }

  /* Enterで自身が作動する要素か（二重実行を避ける） */
  function isActivatable(el) {
    return !!el && !!el.tagName && ['BUTTON', 'A', 'SELECT', 'SUMMARY'].indexOf(el.tagName) !== -1;
  }

  /* ファイルのドラッグ&ドロップ読込。ページ外への遷移（ブラウザ既定動作）も防ぐ。 */
  function wireDropZone() {
    var depth = 0;
    function hasFiles(e) {
      var types = e.dataTransfer && e.dataTransfer.types;
      return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
    }
    function setDropping(onOff) { document.body.classList.toggle('is-dropping', onOff); }
    function isModalOpen() { return !!document.querySelector('.mpv-modal, .mpv-lightbox'); }
    function isFileInput(e) { return !!(e.target && e.target.closest && e.target.closest('input[type="file"]')); }

    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      depth++;
      if (!isModalOpen()) setDropping(true);
    });
    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e) || isFileInput(e)) return; // 写真のファイル入力へのドロップはブラウザに任せる
      e.preventDefault();
      e.dataTransfer.dropEffect = isModalOpen() ? 'none' : 'copy';
    });
    window.addEventListener('drop', function (e) {
      depth = 0;
      setDropping(false);
      if (!hasFiles(e) || isFileInput(e)) return;
      e.preventDefault();
      if (isModalOpen()) return;
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFile(file);
    });
  }

  function setMapOnlyMode(on) {
    mapOnlyMode = !!on;
    var layout = document.querySelector('.mpv-layout');
    if (layout) layout.classList.toggle('is-map-only', mapOnlyMode);
    syncMapOnlyControls();
    refreshMapSize();
  }

  function syncMapOnlyControls() {
    var toggle = document.getElementById('btnMapOnlyToggle');
    var restore = document.getElementById('btnMapOnlyRestore');
    if (toggle) {
      toggle.textContent = tr(mapOnlyMode ? 'mapOnlyClose' : 'mapOnlyOpen');
      toggle.setAttribute('aria-label', tr(mapOnlyMode ? 'mapOnlyClose' : 'mapOnlyOpen'));
      toggle.setAttribute('aria-pressed', mapOnlyMode ? 'true' : 'false');
    }
    if (restore) {
      restore.textContent = tr('mapOnlyClose');
      restore.setAttribute('aria-label', tr('mapOnlyClose'));
      restore.hidden = !mapOnlyMode;
    }
  }

  function refreshMapSize() {
    if (!mapview || !mapview.map || !mapview.map.invalidateSize) return;
    mapview.map.invalidateSize();
    setTimeout(function () { mapview.map.invalidateSize(); }, mapLayoutTransitionMs() + 30);
  }

  function mapLayoutTransitionMs() {
    var layout = document.querySelector('.mpv-layout');
    if (!layout || !global.getComputedStyle) return 200;
    var raw = global.getComputedStyle(layout).getPropertyValue('--mpv-layout-transition').trim();
    var value = parseFloat(raw);
    if (!isFinite(value)) return 200;
    return raw.indexOf('ms') === -1 ? value * 1000 : value;
  }

  function syncLayerControls() {
    var base = mapview.currentBaseKey;
    document.querySelectorAll('input[name="base"]').forEach(function (r) { r.checked = (r.value === base); });
    var ov = mapview.getActiveOverlays();
    document.querySelectorAll('input[data-overlay]').forEach(function (c) {
      c.checked = ov.indexOf(c.getAttribute('data-overlay')) !== -1;
    });
    var slider = document.getElementById('overlayOpacity');
    if (slider) slider.value = Math.round(mapview.overlayOpacity * 100);
  }

  /* ---- サンプル/自動退避 ---- */
  function loadSample() {
    fetch('samples/sample.yaml')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) { importText(text, 'yaml'); })
      .catch(function (e) {
        alert(tr('sampleLoadError', { message: e.message }));
      });
  }

  function autosave() {
    try {
      localStorage.setItem(LS_KEY, exportYaml());
    } catch (e) {
      // 容量超過（埋め込み写真が多い等）。編集は続けられるが退避されないことを知らせる
      setStatus(tr('autosaveFailed'));
    }
  }

  function restoreAutosave() {
    var saved;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) { saved = null; }
    if (!saved || !confirm(tr('restoreAutosave'))) return;
    try {
      applyParsed(Store.parseYaml(saved));
    } catch (e) {
      alert(tr('loadError', { message: e.message }));
    }
  }

  /* ---- 小物 ---- */
  function on(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }
  function setStatus(msg) {
    var el = document.getElementById('status');
    if (el) el.textContent = msg || '';
  }
  function round(n) { return global.Util.round(n); }

  // expose for debugging/tests
  global.App = {
    boot: boot,
    _state: state,
    importText: importText,
    exportYaml: exportYaml,
    selectionFeatures: selectionFeatures,
    undo: undo,
    redo: redo
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : this);
