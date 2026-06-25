/* app.js — 状態管理の中心 / 各モジュール結線 / 入出力 */
(function (global) {
  'use strict';

  var LS_KEY = 'mpv:autosave';

  var state = {
    meta: {},
    view: null,
    tags: new Map(),          // id -> tag
    features: new Map(),      // id -> feature
    hiddenTags: new Set(),    // 非表示タグ
    selection: { rect: null, ids: [] },
    activeFeatureId: null
  };

  var mapview, detail, ui;
  var selectMode = 'intersect';
  var respectHidden = true;
  var drawCreateHandler = null;  // 現在の作図セッションの pm:create ハンドラ
  var rectCleanup = null;        // 現在の矩形選択セッションの解除関数

  function tagsArray() { return Array.from(state.tags.values()); }
  function featuresArray() { return Array.from(state.features.values()); }
  function tagsById() {
    var o = {}; state.tags.forEach(function (t, k) { o[k] = t; }); return o;
  }
  function isHidden(feature) { return state.hiddenTags.has(feature.tag); }

  function boot() {
    mapview = new global.MapView();
    mapview.initMap(document.getElementById('map'), state.view || global.Store.DEFAULT_VIEW, {
      onFeatureClick: selectFeature
    });

    detail = new global.Detail(document.getElementById('detail'), {
      onFocus: function (f) { mapview.focusFeature(f.id); },
      onEdit: function (f) { editFeature(f); },
      onDelete: function (f) { deleteFeature(f.id); }
    });
    detail.clearDetail();

    ui = new global.UI({
      tagList: document.getElementById('tagList'),
      featureList: document.getElementById('featureList'),
      selectionList: document.getElementById('selectionList'),
      selectionCount: document.getElementById('selectionCount'),
      warnings: document.getElementById('warnings')
    }, {
      onToggleTag: toggleTag,
      onEditTag: function (t) { ui.openTagEditor(t, saveTag); },
      onDeleteTag: deleteTag,
      onSelectFeature: selectFeature
    });

    wireToolbar();
    renderAll();
    restoreAutosave();
  }

  /* ---- 入出力 ---- */
  function loadFromYamlText(text) {
    var parsed;
    try {
      parsed = global.Store.parseYaml(text);
    } catch (e) {
      alert('読込エラー: ' + e.message);
      return;
    }
    state.meta = parsed.meta || {};
    state.view = parsed.view;
    state.tags = new Map();
    parsed.tags.forEach(function (t) { state.tags.set(t.id, t); });
    state.features = new Map();
    parsed.features.forEach(function (f) { state.features.set(f.id, f); });
    state.hiddenTags = new Set();
    state.selection = { rect: null, ids: [] };
    state.activeFeatureId = null;

    if (state.view) {
      mapview.map.setView(state.view.center, state.view.zoom);
      if (state.view.baseLayer) mapview.setBaseLayer(state.view.baseLayer);
      Object.keys(global.MapView.OVERLAY_DEFS).forEach(function (k) {
        mapview.toggleOverlay(k, (state.view.overlays || []).indexOf(k) !== -1);
      });
      syncLayerControls();
    }
    redrawFeatures();
    renderAll();
    ui.showWarnings(parsed.warnings);
    detail.clearDetail();
    autosave();
  }

  function exportYaml(features) {
    var snap = {
      meta: state.meta,
      view: mapview.getView(),
      tags: tagsArray(),
      features: features || featuresArray()
    };
    return global.Store.dumpYaml(snap);
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

  function selectionFeatures() {
    return state.selection.ids.map(function (id) { return state.features.get(id); }).filter(Boolean);
  }

  /* ---- 描画 ---- */
  function redrawFeatures() {
    mapview.clearFeatures();
    var byId = tagsById();
    featuresArray().forEach(function (f) {
      mapview.renderFeature(f, byId[f.tag]);
      mapview.setFeatureVisible(f.id, !state.hiddenTags.has(f.tag));
    });
  }

  function renderAll() {
    ui.renderTagList(tagsArray(), state.hiddenTags);
    ui.renderFeatureList(featuresArray(), tagsById(), state.activeFeatureId);
    ui.renderSelectionList(selectionFeatures(), tagsById(), state.activeFeatureId);
  }

  /* ---- 操作 ---- */
  function selectFeature(id) {
    var f = state.features.get(id);
    if (!f) return;
    state.activeFeatureId = id;
    detail.showDetail(f, state.tags.get(f.tag), state.meta);
    mapview.focusFeature(id);
    ui.renderFeatureList(featuresArray(), tagsById(), id);
    ui.renderSelectionList(selectionFeatures(), tagsById(), id);
  }

  function toggleTag(tagId, visible) {
    if (visible) state.hiddenTags.delete(tagId);
    else state.hiddenTags.add(tagId);
    featuresArray().forEach(function (f) {
      if (f.tag === tagId) mapview.setFeatureVisible(f.id, visible);
    });
    ui.renderTagList(tagsArray(), state.hiddenTags);
    autosave();
  }

  function saveTag(tag, isNew) {
    state.tags.set(tag.id, tag);
    redrawFeatures();
    renderAll();
    autosave();
  }

  function deleteTag(tagId) {
    if (!confirm('タグ "' + tagId + '" を削除しますか？（所属フィーチャは未分類へ）')) return;
    state.tags.delete(tagId);
    if (!state.tags.has('__uncategorized__')) {
      state.tags.set('__uncategorized__', { id: '__uncategorized__', name: '未分類', color: '#9e9e9e' });
    }
    featuresArray().forEach(function (f) { if (f.tag === tagId) f.tag = '__uncategorized__'; });
    redrawFeatures();
    renderAll();
    autosave();
  }

  function editFeature(f) {
    ui.openFeatureEditor(f, tagsArray(), { meta: state.meta }, function (nf) {
      state.features.set(nf.id, nf);
      mapview.removeFeature(nf.id);
      mapview.renderFeature(nf, state.tags.get(nf.tag));
      mapview.setFeatureVisible(nf.id, !state.hiddenTags.has(nf.tag));
      renderAll();
      if (state.activeFeatureId === nf.id) detail.showDetail(nf, state.tags.get(nf.tag), state.meta);
      autosave();
    });
  }

  function deleteFeature(id) {
    if (!confirm('このプロットを削除しますか？')) return;
    state.features.delete(id);
    mapview.removeFeature(id);
    state.selection.ids = state.selection.ids.filter(function (x) { return x !== id; });
    if (state.activeFeatureId === id) { state.activeFeatureId = null; detail.clearDetail(); }
    renderAll();
    autosave();
  }

  /* ---- 作図（Geomanがあれば利用） ---- */
  function addFeatureByType(type) {
    if (!mapview.map.pm) {
      alert('作図ツール(Leaflet-Geoman)が読み込まれていません。');
      return;
    }
    // 既存の作図/矩形選択セッションを解除してから開始（ハンドラ積み増しを防止）
    cancelDraw();
    cancelRectSelect();
    var shape = { point: 'Marker', line: 'Line', polygon: 'Polygon' }[type];
    drawCreateHandler = function (e) {
      var coords = geomanToCoords(type, e.layer);
      mapview.map.removeLayer(e.layer); // 一旦削除し内部管理レイヤとして再生成
      cancelDraw();                     // セッション終了（disableDraw + off）
      var f = {
        id: nextId(type),
        type: type,
        tag: defaultTagId(),
        name: '',
        coordinates: coords,
        properties: {}
      };
      // 確定前は state に登録せず、プレビュー描画のみ。保存で確定、キャンセルで破棄。
      mapview.renderFeature(f, state.tags.get(f.tag));
      ui.openFeatureEditor(f, tagsArray(), { meta: state.meta }, function (nf) {
        mapview.removeFeature(f.id);     // プレビュー除去
        state.features.set(nf.id, nf);
        mapview.renderFeature(nf, state.tags.get(nf.tag));
        mapview.setFeatureVisible(nf.id, !state.hiddenTags.has(nf.tag));
        renderAll();
        if (state.activeFeatureId === nf.id) detail.showDetail(nf, state.tags.get(nf.tag), state.meta);
        autosave();
      }, function () {
        mapview.removeFeature(f.id);     // キャンセル：プレビュー破棄（state未登録）
      });
    };
    mapview.map.on('pm:create', drawCreateHandler);
    mapview.map.pm.enableDraw(shape, { snappable: true });
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

  function geomanToCoords(type, layer) {
    if (type === 'point') {
      var ll = layer.getLatLng();
      return [round(ll.lat), round(ll.lng)];
    }
    if (type === 'line') {
      return layer.getLatLngs().map(function (p) { return [round(p.lat), round(p.lng)]; });
    }
    // polygon
    var rings = layer.getLatLngs();
    return rings.map(function (ring) { return ring.map(function (p) { return [round(p.lat), round(p.lng)]; }); });
  }

  function defaultTagId() {
    var first = tagsArray()[0];
    if (first) return first.id;
    state.tags.set('__uncategorized__', { id: '__uncategorized__', name: '未分類', color: '#9e9e9e' });
    return '__uncategorized__';
  }

  function nextId(type) {
    var p = (type === 'point' ? 'p' : type === 'line' ? 'l' : 'g');
    var n = 1;
    while (state.features.has(p + pad(n))) n++;
    return p + pad(n);
  }
  function pad(n) { return (n < 100 ? ('00' + n).slice(-3) : String(n)); }

  /* ---- 矩形範囲抽出（R9） ---- */
  function beginRectSelect() {
    // 進行中の作図/前回の矩形選択セッションを解除（リスナ積み増し・残留矩形を防止）
    cancelDraw();
    cancelRectSelect();
    setStatus('矩形をドラッグして範囲を指定…');
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
      setStatus(ids.length + ' 件抽出（' + (selectMode === 'within' ? '内包' : '交差') + '）');
    });
  }

  function clearSelection() {
    cancelRectSelect();
    mapview.clearSelectionRect();
    state.selection = { rect: null, ids: [] };
    ui.renderSelectionList([], tagsById(), state.activeFeatureId);
    setStatus('');
  }

  /* ---- ツールバー結線 ---- */
  function wireToolbar() {
    on('btnLoad', 'click', function () { document.getElementById('fileInput').click(); });
    document.getElementById('fileInput').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { loadFromYamlText(reader.result); };
      reader.readAsText(file);
      e.target.value = '';
    });
    on('btnSaveYaml', 'click', function () { download('map-data.yaml', exportYaml(), 'text/yaml;charset=utf-8'); });
    on('btnLoadSample', 'click', loadSample);

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
      download('selection.geojson', JSON.stringify(global.UI.toGeoJSONCollection(selectionFeatures()), null, 2), 'application/geo+json');
    });
    on('btnExportSelCsv', 'click', function () {
      download('selection.csv', global.UI.toCSV(selectionFeatures(), tagsById()), 'text/csv;charset=utf-8');
    });

    // 背景レイヤ・オーバーレイ
    document.querySelectorAll('input[name="base"]').forEach(function (r) {
      r.addEventListener('change', function () { mapview.setBaseLayer(r.value); autosave(); });
    });
    document.querySelectorAll('input[data-overlay]').forEach(function (c) {
      c.addEventListener('change', function () { mapview.toggleOverlay(c.getAttribute('data-overlay'), c.checked); autosave(); });
    });
  }

  function syncLayerControls() {
    var base = mapview.currentBaseKey;
    document.querySelectorAll('input[name="base"]').forEach(function (r) { r.checked = (r.value === base); });
    var ov = mapview.getActiveOverlays();
    document.querySelectorAll('input[data-overlay]').forEach(function (c) {
      c.checked = ov.indexOf(c.getAttribute('data-overlay')) !== -1;
    });
  }

  /* ---- サンプル/自動退避 ---- */
  function loadSample() {
    fetch('samples/sample.yaml')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(loadFromYamlText)
      .catch(function (e) {
        alert('サンプル読込に失敗しました（file:// では fetch が制限される場合があります）。\nローカルサーバ経由で開くか、ファイル選択から sample.yaml を読み込んでください。\n' + e.message);
      });
  }

  function autosave() {
    try {
      localStorage.setItem(LS_KEY, exportYaml());
    } catch (e) { /* quota等は無視 */ }
  }

  function restoreAutosave() {
    var saved;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) { saved = null; }
    if (saved) {
      if (confirm('前回の編集データを復元しますか？')) loadFromYamlText(saved);
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
  function round(n) { return Math.round(n * 1e6) / 1e6; }

  // expose for debugging/tests
  global.App = {
    boot: boot,
    _state: state,
    loadFromYamlText: loadFromYamlText,
    exportYaml: exportYaml,
    selectionFeatures: selectionFeatures
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : this);
