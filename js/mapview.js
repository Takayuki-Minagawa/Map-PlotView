/* mapview.js — Leaflet初期化 / 背景・オーバーレイ / フィーチャ描画 / ハイライト / 矩形選択 */
(function (global) {
  'use strict';

  var GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
  var OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  var BASE_DEFS = {
    std:   { url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',           attr: GSI_ATTR, max: 18, label: '標準地図' },
    pale:  { url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',          attr: GSI_ATTR, max: 18, label: '淡色地図' },
    photo: { url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', attr: GSI_ATTR, max: 18, label: '空中写真' },
    osm:   { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',                     attr: OSM_ATTR, max: 19, label: 'OSM' }
  };
  var OVERLAY_DEFS = {
    afm: { url: 'https://cyberjapandata.gsi.go.jp/xyz/afm/{z}/{x}/{y}.png', attr: GSI_ATTR, max: 16, label: '活断層図' }
  };

  function MapView() {
    this.map = null;
    this.baseLayers = {};
    this.overlayLayers = {};
    this.currentBaseKey = null;
    this.featureGroup = null;       // フィーチャ用レイヤグループ
    this.layerObjects = new Map();  // featureId -> leaflet layer
    this.highlightLayer = null;
    this._onFeatureClick = null;
  }

  MapView.prototype.initMap = function (el, view, handlers) {
    var v = view || global.Store.DEFAULT_VIEW;
    handlers = handlers || {};
    this._onFeatureClick = handlers.onFeatureClick || null;

    this.map = global.L.map(el, { zoomControl: true, preferCanvas: false })
      .setView(v.center, v.zoom);

    // 背景レイヤ生成
    var self = this;
    Object.keys(BASE_DEFS).forEach(function (k) {
      var d = BASE_DEFS[k];
      self.baseLayers[k] = global.L.tileLayer(d.url, { attribution: d.attr, maxZoom: d.max, maxNativeZoom: d.max });
    });
    Object.keys(OVERLAY_DEFS).forEach(function (k) {
      var d = OVERLAY_DEFS[k];
      self.overlayLayers[k] = global.L.tileLayer(d.url, { attribution: d.attr, maxZoom: d.max, maxNativeZoom: d.max, opacity: 0.85 });
    });

    this.setBaseLayer(v.baseLayer || 'pale');
    (v.overlays || []).forEach(function (k) { self.toggleOverlay(k, true); });

    this.featureGroup = global.L.featureGroup().addTo(this.map);
    return this.map;
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
      if (self._onFeatureClick) self._onFeatureClick(feature.id);
    });
    layer.addTo(this.featureGroup);
    this.layerObjects.set(feature.id, layer);
    return layer;
  };

  MapView.prototype.removeFeature = function (id) {
    var layer = this.layerObjects.get(id);
    if (layer) { this.featureGroup.removeLayer(layer); this.layerObjects.delete(id); }
  };

  MapView.prototype.clearFeatures = function () {
    this.featureGroup.clearLayers();
    this.layerObjects.clear();
  };

  MapView.prototype.setFeatureVisible = function (id, visible) {
    var layer = this.layerObjects.get(id);
    if (!layer) return;
    if (visible && !this.featureGroup.hasLayer(layer)) this.featureGroup.addLayer(layer);
    else if (!visible && this.featureGroup.hasLayer(layer)) this.featureGroup.removeLayer(layer);
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

  MapView.prototype.getView = function () {
    var c = this.map.getCenter();
    return {
      center: [round(c.lat), round(c.lng)],
      zoom: this.map.getZoom(),
      baseLayer: this.currentBaseKey,
      overlays: this.getActiveOverlays()
    };
  };

  MapView.prototype.getActiveOverlays = function () {
    var self = this, on = [];
    Object.keys(this.overlayLayers).forEach(function (k) {
      if (self.map.hasLayer(self.overlayLayers[k])) on.push(k);
    });
    return on;
  };

  /* 矩形選択：ドラッグで1つの矩形を描き、bbox GeoJSON(Polygon)を onDone に返す */
  MapView.prototype.startRectangleSelect = function (onDone) {
    var self = this;
    var start = null, rect = null;
    this.clearSelectionRect();
    this.map.dragging.disable();
    this.map.getContainer().style.cursor = 'crosshair';

    function onMouseDown(e) {
      start = e.latlng;
      rect = global.L.rectangle([start, start], { color: '#ff5722', weight: 2, dashArray: '5,5', fillOpacity: 0.08 }).addTo(self.map);
    }
    function onMouseMove(e) {
      if (!start || !rect) return;
      rect.setBounds(global.L.latLngBounds(start, e.latlng));
    }
    function onMouseUp(e) {
      if (!start) { cleanup(); return; }
      // mouseupがマップ外でも拾えるよう、latlngが無ければ最後のrect境界を使う
      var endLatLng = (e && e.latlng) ? e.latlng : (rect ? rect.getBounds().getNorthEast() : start);
      var b = global.L.latLngBounds(start, endLatLng);
      // クリックのみ（ドラッグ無し）の極小矩形は無効として破棄
      if (!b.isValid() || (b.getNorth() === b.getSouth() && b.getEast() === b.getWest())) {
        if (rect) self.map.removeLayer(rect);
        cleanup();
        return;
      }
      self.selectionRect = rect;
      cleanup();
      var gj = boundsToGeoJSON(b);
      if (onDone) onDone(gj, b);
    }
    function cleanup() {
      self.map.off('mousedown', onMouseDown);
      self.map.off('mousemove', onMouseMove);
      self.map.off('mouseup', onMouseUp);
      document.removeEventListener('mouseup', onDocUp, true);
      self.map.dragging.enable();
      self.map.getContainer().style.cursor = '';
      start = null;
    }
    // マップコンテナ外でマウスを離したケースの保険
    function onDocUp() { if (start) onMouseUp(null); }

    this.map.on('mousedown', onMouseDown);
    this.map.on('mousemove', onMouseMove);
    this.map.on('mouseup', onMouseUp);
    document.addEventListener('mouseup', onDocUp, true);

    // キャンセル用
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
    var name = global.Symbols.escapeHtml(feature.name || feature.id || '(無名)');
    var tagName = tag ? global.Symbols.escapeHtml(tag.name || tag.id) : '';
    return '<div class="mpv-popup"><b>' + name + '</b><br><small>' + tagName + ' / ' + feature.type + '</small></div>';
  }

  function round(n) { return Math.round(n * 1e6) / 1e6; }

  global.MapView = MapView;
  global.MapView.BASE_DEFS = BASE_DEFS;
  global.MapView.OVERLAY_DEFS = OVERLAY_DEFS;
  global.MapView.boundsToGeoJSON = boundsToGeoJSON;
})(typeof window !== 'undefined' ? window : this);
