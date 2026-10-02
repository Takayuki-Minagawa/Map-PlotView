/* tests/helpers/app-harness.js — app.js をDOM/Leaflet無しで動かすためのスタブ一式
 * Store / UndoHistory / Util / I18n は本物を使い、document・MapView・Detail・UI だけを差し替える。 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const jsyaml = require('js-yaml');
const { createSandbox, loadScript, ROOT } = require('./load');

/* opts: { quota: true で localStorage.setItem を失敗させる, autosaved: 起動時に復元させるYAML } */
function makeApp(opts) {
  opts = opts || {};
  const s = createSandbox({ jsyaml });
  ['i18n.js', 'symbols.js', 'store.js', 'history.js', 'geocode.js', 'select.js', 'ui.js'].forEach(name => loadScript(name, s));
  s.I18n.init = () => {};

  const els = {};
  function el(id) {
    if (!els[id]) {
      els[id] = {
        id, listeners: {}, hidden: false, disabled: false, textContent: '', value: '', style: {},
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        setAttribute() {}, blur() {},
        classList: { toggle() {}, add() {}, remove() {} },
        fire(ev, e) { return this.listeners[ev](e || { target: this, preventDefault() {} }); }
      };
    }
    return els[id];
  }
  const docListeners = {};
  const document = {
    readyState: 'complete',
    getElementById: el,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener(ev, fn) { docListeners[ev] = fn; },
    body: { classList: { toggle() {} }, appendChild() {} },
    createElement: () => el('_tmp')
  };
  const store = {};
  if (opts.autosaved) store['mpv:autosave'] = opts.autosaved;
  const quota = { fail: !!opts.quota };
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { if (quota.fail) throw new Error('quota'); store[k] = v; }
  };
  s.addEventListener = () => {};

  /* 地図のスタブ：描画したフィーチャと編集セッションだけを記録する */
  function MapView() {
    this.layers = new Map();
    this.visible = new Map();
    this._editingId = null;
    this.currentBaseKey = 'pale';
    this.overlayOpacity = 0.85;
    this.editedCoords = null;      // getEditedCoords が返す値（テスト側で設定）
    this.drawEnabled = false;
    const self = this;
    this.map = {
      pm: {
        enableDraw() { self.drawEnabled = true; },
        disableDraw() { self.drawEnabled = false; },
        globalDrawModeEnabled() { return self.drawEnabled; },
        Draw: { Line: { removed: 0, _removeLastVertex() { this.removed++; } } }
      },
      handlers: {},
      on(ev, fn) { this.handlers[ev] = fn; },
      off(ev) { delete this.handlers[ev]; },
      setView() {}, closePopup() {}, removeLayer() {}, invalidateSize() {}
    };
  }
  Object.assign(MapView.prototype, {
    initMap() {},
    setBaseLayer(k) { this.currentBaseKey = k; },
    toggleOverlay() {},
    setOverlayOpacity(v) { this.overlayOpacity = v; },
    getActiveOverlays() { return []; },
    renderFeature(f, tag) { this.layers.set(f.id, { f, tag }); this.visible.set(f.id, true); },
    removeFeature(id) { if (this._editingId === id) this.stopGeometryEdit(); this.layers.delete(id); this.visible.delete(id); },
    clearFeatures() { this.stopGeometryEdit(); this.layers.clear(); this.visible.clear(); },
    setFeatureVisible(id, v) { if (this.layers.has(id)) this.visible.set(id, v); },
    focusFeature() {}, fitAllFeatures() {}, clearSelectionRect() {}, clearSearchMarker() {},
    showSearchMarker(latlng, title, action) { this.searchAction = action; },
    getView() { return { center: [35, 139], zoom: 10, baseLayer: this.currentBaseKey, overlays: [], overlayOpacity: this.overlayOpacity }; },
    startGeometryEdit(id) {
      if (!this.layers.has(id) || !this.visible.get(id)) return false;
      this._editingId = id;
      return true;
    },
    getEditedCoords() { return this._editingId != null ? this.editedCoords : null; },
    stopGeometryEdit() { this._editingId = null; },
    startRectangleSelect(cb) { this.rectDone = cb; return () => { this.rectDone = null; }; }
  });
  MapView.OVERLAY_DEFS = {};
  MapView.DEFAULT_OVERLAY_OPACITY = 0.85;
  MapView.layerToCoords = (type, layer) => layer.coords;
  let mapview = null;
  s.MapView = function () { mapview = new MapView(); return mapview; };
  s.MapView.OVERLAY_DEFS = MapView.OVERLAY_DEFS;
  s.MapView.DEFAULT_OVERLAY_OPACITY = MapView.DEFAULT_OVERLAY_OPACITY;
  s.MapView.layerToCoords = MapView.layerToCoords;

  /* cap: app.js が各スタブへ渡したコールバックや引数の控え */
  const cap = { warnings: null, nextChoice: null, confirm: true };
  function Detail(elm, handlers) { cap.detail = handlers; cap.detailObj = this; this.current = null; }
  Detail.prototype.showDetail = function (f) { this.current = f; };
  Detail.prototype.clearDetail = function () { this.current = null; };
  Detail.resolveSrc = x => x;
  s.Detail = Detail;

  const RealUI = s.UI;
  function UIStub(refs, handlers) { cap.ui = handlers; }
  Object.assign(UIStub.prototype, {
    renderTagList(tags) { cap.tagList = tags; },
    renderFeatureList(features) { cap.featureList = features; },
    renderSelectionList(features) { cap.selectionList = features; },
    showWarnings(w) { cap.warnings = w; },
    renderSearchResults() {},
    openTagEditor(tag, onSave) { cap.tagEditor = { tag, onSave }; },
    openFeatureEditor(feature, tags, ctx, onSave, onCancel) { cap.featureEditor = { feature, tags, ctx, onSave, onCancel }; }
  });
  UIStub.toCSV = RealUI.toCSV;
  UIStub.parseProps = RealUI.parseProps;
  UIStub.toGeoJSONCollection = RealUI.toGeoJSONCollection;
  /* 追加/置き換えの選択：cap.nextChoice に 'merge' | 'replace' を入れておくと即座に選ぶ（nullならキャンセル扱い） */
  UIStub.choose = (title, message, options, onPick) => {
    cap.chooseOptions = options;
    if (cap.nextChoice) onPick(cap.nextChoice);
  };
  s.UI = UIStub;

  const alerts = [];
  const code = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const run = new Function('window', 'document', 'localStorage', 'confirm', 'alert', 'fetch', 'setTimeout', 'clearTimeout', code);
  run.call(s, s, document, localStorage,
    () => cap.confirm, m => alerts.push(m),
    () => Promise.reject(new Error('no fetch in tests')),
    fn => fn(), () => {});

  return {
    App: s.App, state: s.App._state, Store: s.Store, cap, el, alerts, store, quota,
    get mapview() { return mapview; },
    status: () => el('status').textContent,
    key(e) { return docListeners.keydown(Object.assign({ target: {}, preventDefault() {} }, e)); },
    /* 編集モーダルで保存したのと同じ経路でタグ/フィーチャを追加する */
    addTag(tag) { el('btnAddTag').fire('click'); return cap.tagEditor.onSave(tag, true); },
    ids: () => Array.from(s.App._state.features.keys()),
    tagIds: () => Array.from(s.App._state.tags.keys())
  };
}

module.exports = { makeApp };
