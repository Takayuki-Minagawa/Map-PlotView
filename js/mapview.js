/* mapview.js — Leaflet初期化 / 背景・オーバーレイ / フィーチャ描画 / ハイライト / 矩形選択 / 形状編集 */
(function (global) {
  'use strict';

  var GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
  var OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  var HAZARD_ATTR = '<a href="https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/copyright/opendata.html" target="_blank" rel="noopener">ハザードマップポータルサイト</a>';

  var GSI = 'https://cyberjapandata.gsi.go.jp/xyz/';
  var HAZARD = 'https://disaportaldata.gsi.go.jp/raster/';

  /* max はタイルが提供される最大ズーム。それ以上は MAX_ZOOM まで拡大表示する。 */
  var MAX_ZOOM = 19;
  var BASE_DEFS = {
    std:   { url: GSI + 'std/{z}/{x}/{y}.png',           attr: GSI_ATTR, max: 18 }, // 標準地図
    pale:  { url: GSI + 'pale/{z}/{x}/{y}.png',          attr: GSI_ATTR, max: 18 }, // 淡色地図
    photo: { url: GSI + 'seamlessphoto/{z}/{x}/{y}.jpg', attr: GSI_ATTR, max: 18 }, // 空中写真
    osm:   { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: OSM_ATTR, max: 19 }
  };
  /* 定義順が重ね順（後のものほど上）。urls が複数あるものは1つのオーバーレイとしてまとめて切り替える。 */
  var OVERLAY_DEFS = {
    hillshade: { urls: [GSI + 'hillshademap/{z}/{x}/{y}.png'], attr: GSI_ATTR, max: 16 }, // 陰影起伏図
    relief:    { urls: [GSI + 'relief/{z}/{x}/{y}.png'],       attr: GSI_ATTR, max: 15 }, // 色別標高図
    afm:       { urls: [GSI + 'afm/{z}/{x}/{y}.png'],          attr: GSI_ATTR, max: 16 }, // 活断層図
    flood:     { urls: [HAZARD + '01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png'], attr: HAZARD_ATTR, max: 17 }, // 洪水浸水想定区域（想定最大規模）
    sediment:  {                                                                                             // 土砂災害警戒区域
      urls: [
        HAZARD + '05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',   // 土石流
        HAZARD + '05_kyukeishakeikaikuiki/{z}/{x}/{y}.png',   // 急傾斜地の崩壊
        HAZARD + '05_jisuberikeikaikuiki/{z}/{x}/{y}.png'     // 地すべり
      ],
      attr: HAZARD_ATTR, max: 17
    },
    tsunami:   { urls: [HAZARD + '04_tsunami_newlegend_data/{z}/{x}/{y}.png'], attr: HAZARD_ATTR, max: 17 }  // 津波浸水想定
  };
  var DEFAULT_OVERLAY_OPACITY = 0.85;
  var SEARCH_COLOR = '#ff5722';

  function MapView() {
    this.map = null;
    this.baseLayers = {};
    this.overlayLayers = {};        // key -> L.layerGroup(タイルレイヤ群)
    this.overlayOpacity = DEFAULT_OVERLAY_OPACITY;
    this.currentBaseKey = null;
    this.featureGroup = null;       // フィーチャ用レイヤグループ
    this.layerObjects = new Map();  // featureId -> leaflet layer
    this.selectionRect = null;
    this.searchMarker = null;
    this.locationLayer = null;
    this._editingId = null;         // 形状編集中のfeatureId
    this._locating = false;
    this._onFeatureClick = null;
  }

  MapView.prototype.initMap = function (el, view, handlers) {
    var v = view || global.Store.DEFAULT_VIEW;
    handlers = handlers || {};
    this._onFeatureClick = handlers.onFeatureClick || null;

    this.map = global.L.map(el, { zoomControl: true, preferCanvas: false })
      .setView(v.center, v.zoom);
    global.L.control.scale({ imperial: false }).addTo(this.map);

    // 背景レイヤ生成
    var self = this;
    Object.keys(BASE_DEFS).forEach(function (k) {
      var d = BASE_DEFS[k];
      self.baseLayers[k] = global.L.tileLayer(d.url, { attribution: d.attr, maxZoom: MAX_ZOOM, maxNativeZoom: d.max });
    });
    Object.keys(OVERLAY_DEFS).forEach(function (k, i) {
      var d = OVERLAY_DEFS[k];
      self.overlayLayers[k] = global.L.layerGroup(d.urls.map(function (url) {
        return global.L.tileLayer(url, {
          attribution: d.attr, maxZoom: MAX_ZOOM, maxNativeZoom: d.max, opacity: self.overlayOpacity, zIndex: 10 + i
        });
      }));
    });

    this.setBaseLayer(v.baseLayer || 'pale');
    (v.overlays || []).forEach(function (k) { self.toggleOverlay(k, true); });
    if (typeof v.overlayOpacity === 'number') this.setOverlayOpacity(v.overlayOpacity);

    this.featureGroup = global.L.featureGroup().addTo(this.map);
    this._watchResize(el);
    return this.map;
  };

  /* 詳細パネルの開閉などで地図領域の大きさが変わったら、中心を保ったまま再計算する。
   * （Leafletはウィンドウのリサイズしか検知しない） */
  MapView.prototype._watchResize = function (el) {
    if (!global.ResizeObserver) return;
    var map = this.map, pending = false;
    new global.ResizeObserver(function () {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(function () {
        pending = false;
        map.invalidateSize();
      });
    }).observe(el);
  };

  MapView.prototype.setBaseLayer = function (key) {
    if (!this.baseLayers[key]) key = 'pale';
    if (this.currentBaseKey && this.baseLayers[this.currentBaseKey]) {
      this.map.removeLayer(this.baseLayers[this.currentBaseKey]);
    }
    this.baseLayers[key].addTo(this.map);
    if (this.baseLayers[key].bringToBack) this.baseLayers[key].bringToBack();
    this.currentBaseKey = key;
  };

  MapView.prototype.toggleOverlay = function (key, on) {
    var layer = this.overlayLayers[key];
    if (!layer) return false;
    var isOn = this.map.hasLayer(layer);
    var want = (typeof on === 'boolean') ? on : !isOn;
    if (want && !isOn) layer.addTo(this.map);
    else if (!want && isOn) this.map.removeLayer(layer);
    return want;
  };

  /* オーバーレイ共通の不透明度（0.1〜1）を設定し、適用した値を返す */
  MapView.prototype.setOverlayOpacity = function (value) {
    var v = Math.min(1, Math.max(0.1, Number(value)));
    if (!isFinite(v)) v = DEFAULT_OVERLAY_OPACITY;
    this.overlayOpacity = v;
    var self = this;
    Object.keys(this.overlayLayers).forEach(function (k) {
      self.overlayLayers[k].eachLayer(function (tile) { tile.setOpacity(v); });
    });
    return v;
  };

  /* feature + tag(色/記号) からLeafletレイヤを生成し地図へ追加 */
  MapView.prototype.renderFeature = function (feature, tag) {
    var self = this;
    var color = (tag && tag.color) || '#2e7d32';
    var symbol = feature.symbol || (tag && tag.symbol);
    var layer;

    if (feature.type === 'point') {
      layer = global.L.marker(feature.coordinates, { icon: global.Symbols.divIcon(symbol, color) });
    } else if (feature.type === 'line') {
      layer = global.L.polyline(feature.coordinates, { color: color, weight: 4, opacity: 0.9 });
    } else if (feature.type === 'polygon') {
      var style = feature.style || {};
      layer = global.L.polygon(feature.coordinates, {
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: (typeof style.fillOpacity === 'number') ? style.fillOpacity : 0.25
      });
    } else {
      return null;
    }

    layer.bindPopup(popupHtml(feature, tag));
    layer.on('click', function () {
      if (self._editingId) return; // 形状編集中は選択を切り替えない
      if (self._onFeatureClick) self._onFeatureClick(feature.id);
    });
    layer.addTo(this.featureGroup);
    this.layerObjects.set(feature.id, layer);
    return layer;
  };

  MapView.prototype.removeFeature = function (id) {
    var layer = this.layerObjects.get(id);
    if (!layer) return;
    if (this._editingId === id) this.stopGeometryEdit();
    this.featureGroup.removeLayer(layer);
    this.layerObjects.delete(id);
  };

  MapView.prototype.clearFeatures = function () {
    this.stopGeometryEdit();
    this.featureGroup.clearLayers();
    this.layerObjects.clear();
  };

  MapView.prototype.setFeatureVisible = function (id, visible) {
    var layer = this.layerObjects.get(id);
    if (!layer) return;
    if (visible && !this.featureGroup.hasLayer(layer)) this.featureGroup.addLayer(layer);
    else if (!visible && this.featureGroup.hasLayer(layer)) this.featureGroup.removeLayer(layer);
  };

  MapView.prototype.isFeatureVisible = function (id) {
    var layer = this.layerObjects.get(id);
    return !!layer && this.featureGroup.hasLayer(layer);
  };

  MapView.prototype.highlightFeature = function (id) {
    var layer = this.layerObjects.get(id);
    if (!layer) return;
    // マーカーはCSSフラッシュ、線/面は一時的に枠強調
    if (layer.getElement && layer.getElement()) {
      var el = layer.getElement();
      el.classList.remove('mpv-flash');
      void el.offsetWidth; // reflow
      el.classList.add('mpv-flash');
    } else if (layer.setStyle) {
      var orig = { weight: layer.options.weight, color: layer.options.color };
      layer.setStyle({ weight: 7, color: '#ff9800' });
      setTimeout(function () { layer.setStyle(orig); }, 1200);
    }
  };

  MapView.prototype.focusFeature = function (id) {
    var layer = this.layerObjects.get(id);
    if (!layer) return;
    if (layer.getLatLng) {
      this.map.setView(layer.getLatLng(), Math.max(this.map.getZoom(), 15), { animate: true });
    } else if (layer.getBounds) {
      this.map.fitBounds(layer.getBounds().pad(0.2));
    }
    this.highlightFeature(id);
  };

  /* 表示中の全フィーチャが収まるようにズーム。対象が無ければfalse。 */
  MapView.prototype.fitAllFeatures = function () {
    var layers = this.featureGroup.getLayers();
    if (!layers.length) return false;
    var b = this.featureGroup.getBounds();
    if (!b.isValid()) return false;
    this.map.fitBounds(b.pad(0.15), { maxZoom: 17 });
    return true;
  };

  MapView.prototype.getView = function () {
    var c = this.map.getCenter();
    return {
      center: [round(c.lat), round(c.lng)],
      zoom: this.map.getZoom(),
      baseLayer: this.currentBaseKey,
      overlays: this.getActiveOverlays(),
      overlayOpacity: this.overlayOpacity
    };
  };

  MapView.prototype.getActiveOverlays = function () {
    var self = this, on = [];
    Object.keys(this.overlayLayers).forEach(function (k) {
      if (self.map.hasLayer(self.overlayLayers[k])) on.push(k);
    });
    return on;
  };

  /* ---- 形状編集（Leaflet-Geoman） ---- */

  /* 指定フィーチャのレイヤを編集モードにする（点はドラッグ移動、線/面は頂点編集）。
   * 非表示・Geoman未読込などで開始できなければfalse。 */
  MapView.prototype.startGeometryEdit = function (id) {
    var layer = this.layerObjects.get(id);
    if (!layer || !layer.pm || !this.featureGroup.hasLayer(layer)) return false;
    this.stopGeometryEdit();
    layer.closePopup();
    layer.unbindPopup(); // 編集中のクリックでポップアップを出さない（確定/取消時の再描画で復帰）
    layer.pm.enable({
      snappable: true,
      allowSelfIntersection: true,
      // 点: 右クリックでマーカーごと消えるのを防ぐ。線/面: 頂点の右クリック削除は許可する
      preventMarkerRemoval: !!layer.getLatLng,
      removeLayerBelowMinVertexCount: false  // 頂点を減らし過ぎてレイヤごと消えるのを防ぐ
    });
    var el = layer.getElement && layer.getElement();
    if (el) el.classList.add('mpv-editing');
    this._editingId = id;
    return true;
  };

  /* 編集中レイヤの現在の座標を内部表現で返す。編集中でなければnull。 */
  MapView.prototype.getEditedCoords = function (type) {
    var layer = this._editingId != null ? this.layerObjects.get(this._editingId) : null;
    return layer ? layerToCoords(type, layer) : null;
  };

  /* 編集モードを終了する。レイヤの見た目は呼び出し側が再描画して確定/復元すること。 */
  MapView.prototype.stopGeometryEdit = function () {
    if (this._editingId == null) return;
    var layer = this.layerObjects.get(this._editingId);
    this._editingId = null;
    if (!layer) return;
    if (layer.pm) layer.pm.disable();
    var el = layer.getElement && layer.getElement();
    if (el) el.classList.remove('mpv-editing');
  };

  /* Leafletレイヤ → 内部座標（[緯度,経度]、丸め済み） */
  function layerToCoords(type, layer) {
    var pt = function (p) { return [round(p.lat), round(p.lng)]; };
    if (type === 'point') return pt(layer.getLatLng());
    if (type === 'line') return layer.getLatLngs().map(pt);
    return layer.getLatLngs().map(function (ring) { return ring.map(pt); }); // polygon: リング配列
  }

  /* ---- 検索地点・現在地 ---- */

  /* 検索地点へ移動してマーカーを立てる。action: { label, onClick } を渡すとポップアップにボタンを出す。 */
  MapView.prototype.showSearchMarker = function (latlng, title, action) {
    this.clearSearchMarker();
    var node = document.createElement('div');
    node.className = 'mpv-popup';
    var name = document.createElement('b');
    name.textContent = title;
    node.appendChild(name);
    var coords = document.createElement('small');
    coords.textContent = round(latlng[0]) + ', ' + round(latlng[1]);
    node.appendChild(document.createElement('br'));
    node.appendChild(coords);
    if (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mpv-mini mpv-popup__action';
      btn.textContent = action.label;
      btn.addEventListener('click', action.onClick);
      node.appendChild(btn);
    }
    this.map.setView(latlng, Math.max(this.map.getZoom(), 15));
    this.searchMarker = global.L.marker(latlng, {
      icon: global.Symbols.divIcon('🔍', SEARCH_COLOR),
      zIndexOffset: 1000,
      pmIgnore: true
    }).addTo(this.map).bindPopup(node).openPopup();
  };

  MapView.prototype.clearSearchMarker = function () {
    if (this.searchMarker) { this.map.removeLayer(this.searchMarker); this.searchMarker = null; }
  };

  /* 現在地へ移動し、位置と精度円を表示する。成功時 onDone()、失敗時 onError(event) を呼ぶ。 */
  MapView.prototype.locate = function (onDone, onError) {
    var self = this, map = this.map;
    if (this._locating) return;
    this._locating = true;
    function done() {
      self._locating = false;
      map.off('locationfound', found);
      map.off('locationerror', failed);
    }
    function found(e) {
      done();
      if (self.locationLayer) map.removeLayer(self.locationLayer);
      self.locationLayer = global.L.layerGroup([
        global.L.circle(e.latlng, { radius: e.accuracy, color: '#1565c0', weight: 1, fillOpacity: 0.12, interactive: false, pmIgnore: true }),
        global.L.circleMarker(e.latlng, { radius: 6, color: '#fff', weight: 2, fillColor: '#1565c0', fillOpacity: 1, interactive: false, pmIgnore: true })
      ]).addTo(map);
      if (onDone) onDone();
    }
    function failed(e) { done(); if (onError) onError(e); }
    map.on('locationfound', found);
    map.on('locationerror', failed);
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 10000 });
  };

  /* ---- 矩形選択 ---- */

  /* ドラッグで矩形を1つ描き、bbox GeoJSON(Polygon)を onDone に返してセッションを終える。
   * Pointer Events を使うのでマウス・タッチ・ペンのいずれでも操作できる。
   * ドラッグを伴わないクリック/タップは無視してセッションを継続する。戻り値は中断用の関数。 */
  MapView.prototype.startRectangleSelect = function (onDone) {
    var self = this, map = this.map;
    var container = map.getContainer();
    var start = null, rect = null, pointerId = null;
    this.clearSelectionRect();
    map.dragging.disable();
    container.style.cursor = 'crosshair';
    container.classList.add('mpv-rect-selecting');

    function onDown(e) {
      if (start || e.isPrimary === false) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.leaflet-control')) return; // ズームボタン等は通す
      pointerId = e.pointerId;
      start = map.mouseEventToLatLng(e);
      rect = global.L.rectangle([start, start], {
        color: SEARCH_COLOR, weight: 2, dashArray: '5,5', fillOpacity: 0.08, interactive: false, pmIgnore: true
      }).addTo(map);
      e.preventDefault(); // テキスト選択や画像ドラッグを起こさない
    }
    function onMove(e) {
      if (!start || e.pointerId !== pointerId) return;
      rect.setBounds(global.L.latLngBounds(start, map.mouseEventToLatLng(e)));
    }
    function onUp(e) {
      if (!start || e.pointerId !== pointerId) return;
      var b = global.L.latLngBounds(start, map.mouseEventToLatLng(e));
      // ドラッグ無し（面積ゼロ）の矩形は破棄して次のドラッグを待つ
      if (!b.isValid() || b.getNorth() === b.getSouth() || b.getEast() === b.getWest()) {
        discardDrag();
        return;
      }
      rect.setBounds(b);
      self.selectionRect = rect;
      cleanup();
      swallowNextClick();
      if (onDone) onDone(boundsToGeoJSON(b), b);
    }
    // ドラッグの始点と終点が同じフィーチャ上だとclickが発生し、選択やポップアップが動いてしまうのを防ぐ
    function swallowNextClick() {
      function swallow(e) { e.stopPropagation(); e.preventDefault(); }
      container.addEventListener('click', swallow, true);
      setTimeout(function () { container.removeEventListener('click', swallow, true); }, 0);
    }
    function discardDrag() {
      if (rect) map.removeLayer(rect);
      rect = null; start = null; pointerId = null;
    }
    function onCancel(e) {
      if (start && e.pointerId === pointerId) discardDrag();
    }
    function cleanup() {
      container.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      map.dragging.enable();
      container.style.cursor = '';
      container.classList.remove('mpv-rect-selecting');
      // 未確定（途中キャンセル）の矩形が残っていれば除去
      if (rect && rect !== self.selectionRect) map.removeLayer(rect);
      rect = null; start = null; pointerId = null;
    }

    container.addEventListener('pointerdown', onDown);
    // コンテナ外で指/ボタンを離しても拾えるよう document で受ける
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);

    return cleanup;
  };

  MapView.prototype.clearSelectionRect = function () {
    if (this.selectionRect) { this.map.removeLayer(this.selectionRect); this.selectionRect = null; }
  };

  function boundsToGeoJSON(b) {
    var w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
      },
      bbox: [w, s, e, n]
    };
  }

  function popupHtml(feature, tag) {
    var esc = global.Util.escapeHtml;
    var tr = global.I18n ? global.I18n.t : function (key) { return key; };
    var typeLabel = global.I18n ? global.I18n.typeLabel(feature.type) : feature.type;
    var name = esc(feature.name || feature.id || tr('unnamed'));
    var tagName = esc(tag ? (tag.name || tag.id) : tr('uncategorized'));
    return '<div class="mpv-popup"><b>' + name + '</b><br><small>' + tagName + ' / ' + esc(typeLabel) + '</small></div>';
  }

  function round(n) { return global.Util.round(n); }

  global.MapView = MapView;
  global.MapView.BASE_DEFS = BASE_DEFS;
  global.MapView.OVERLAY_DEFS = OVERLAY_DEFS;
  global.MapView.DEFAULT_OVERLAY_OPACITY = DEFAULT_OVERLAY_OPACITY;
  global.MapView.boundsToGeoJSON = boundsToGeoJSON;
  global.MapView.layerToCoords = layerToCoords;
})(typeof window !== 'undefined' ? window : this);
