/* store.js — データモデル / YAML⇄内部構造 / 検証 / 入出力ヘルパ
 * グローバル名前空間 window.Store に公開（ES modulesを使わず file:// 直開きに対応）。
 */
(function (global) {
  'use strict';

  var DEFAULT_VIEW = {
    center: [35.681, 139.767],
    zoom: 13,
    baseLayer: 'pale',
    overlays: []
  };
  var tr = function (key, vars) { return global.I18n ? global.I18n.t(key, vars) : key; };

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function inLatRange(lat) { return isFiniteNumber(lat) && lat >= -90 && lat <= 90; }
  function inLngRange(lng) { return isFiniteNumber(lng) && lng >= -180 && lng <= 180; }

  function isLatLng(pair) {
    return Array.isArray(pair) && pair.length === 2 && inLatRange(pair[0]) && inLngRange(pair[1]);
  }

  /* 1フィーチャの検証。{ok, errors[]} を返す（throwしない）。 */
  function validateFeature(f) {
    var errors = [];
    if (!f || typeof f !== 'object') {
      return { ok: false, errors: [tr('errFeatureNotObject')] };
    }
    if (!f.id) errors.push(tr('errMissingId'));
    var t = f.type;
    if (['point', 'line', 'polygon'].indexOf(t) === -1) {
      errors.push(tr('errInvalidType', { type: t }));
      return { ok: false, errors: errors };
    }
    var c = f.coordinates;
    if (t === 'point') {
      if (!isLatLng(c)) errors.push(tr('errInvalidPointCoords'));
    } else if (t === 'line') {
      if (!Array.isArray(c) || c.length < 2) {
        errors.push(tr('errLineCoords'));
      } else {
        c.forEach(function (p, i) {
          if (!isLatLng(p)) errors.push(tr('errLineVertex', { index: i }));
        });
      }
    } else if (t === 'polygon') {
      // リング配列: [[ [lat,lng], ... ]]
      if (!Array.isArray(c) || c.length < 1) {
        errors.push(tr('errPolygonCoords'));
      } else {
        c.forEach(function (ring, ri) {
          if (!Array.isArray(ring) || ring.length < 3) {
            errors.push(tr('errPolygonRing', { ring: ri }));
          } else {
            ring.forEach(function (p, i) {
              if (!isLatLng(p)) errors.push(tr('errPolygonVertex', { ring: ri, index: i }));
            });
          }
        });
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* YAMLテキスト → 内部構造。検証エラーは warnings として収集（致命的でなければ読み込む）。 */
  function parseYaml(text) {
    var doc;
    try {
      doc = global.jsyaml.load(text);
    } catch (e) {
      throw new Error(tr('yamlSyntaxError', { message: e.message }));
    }
    if (!doc || typeof doc !== 'object') {
      throw new Error(tr('yamlEmptyError'));
    }
    var meta = doc.meta || {};
    var view = Object.assign({}, DEFAULT_VIEW, doc.view || {});
    var tags = Array.isArray(doc.tags) ? doc.tags.slice() : [];
    var rawFeatures = Array.isArray(doc.features) ? doc.features : [];

    var tagIds = {};
    tags.forEach(function (t) { if (t && t.id) tagIds[t.id] = true; });

    var warnings = [];
    var features = [];
    rawFeatures.forEach(function (f, idx) {
      var v = validateFeature(f);
      if (!v.ok) {
        warnings.push(tr('warningFeatureInvalid', { index: idx, id: (f && f.id), errors: v.errors.join(' / ') }));
        return; // 不正なフィーチャはスキップ
      }
      // tag が未定義なら未分類へ
      if (f.tag && !tagIds[f.tag]) {
        warnings.push(tr('warningUnknownTag', { index: idx, id: f.id, tag: f.tag }));
        f = Object.assign({}, f, { tag: '__uncategorized__' });
      }
      if (!f.tag) f = Object.assign({}, f, { tag: '__uncategorized__' });
      features.push(f);
    });

    // 未分類タグを必要に応じて追加
    var hasUncat = features.some(function (f) { return f.tag === '__uncategorized__'; });
    if (hasUncat && !tagIds['__uncategorized__']) {
      tags.push({ id: '__uncategorized__', name: tr('uncategorized'), color: '#9e9e9e' });
    }

    return { meta: meta, view: view, tags: tags, features: features, warnings: warnings };
  }

  /* GeoJSONインポート時にタグへ割り当てる色 */
  var TAG_PALETTE = ['#2e7d32', '#1565c0', '#ef6c00', '#6a1b9a', '#c62828', '#00838f', '#9e9d24', '#4e342e'];

  /* GeoJSONテキスト → 内部構造。parseYamlと同じ形 {meta, view, tags, features, warnings} を返す。
   * viewはnull（現在の表示位置を維持）。properties.tag からタグを自動生成する。 */
  function parseGeoJSON(text) {
    var doc;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      throw new Error(tr('geojsonSyntaxError', { message: e.message }));
    }
    var rawFeatures = null;
    if (doc && doc.type === 'FeatureCollection') rawFeatures = Array.isArray(doc.features) ? doc.features : [];
    else if (doc && doc.type === 'Feature') rawFeatures = [doc];
    if (!rawFeatures || !rawFeatures.length) {
      throw new Error(tr('geojsonEmptyError'));
    }

    var warnings = [];
    var features = [];
    var usedIds = {};
    rawFeatures.forEach(function (gj) {
      if (gj && gj.id != null) usedIds[gj.id] = true;
    });

    var assignedIds = {};
    rawFeatures.forEach(function (gj, idx) {
      if (!gj || typeof gj !== 'object') {
        warnings.push(tr('warningFeatureInvalid', { index: idx, id: '', errors: tr('errFeatureNotObject') }));
        return;
      }
      var f;
      try {
        f = fromGeoJSON(gj);
      } catch (e) {
        // 座標欠落など変換不能なFeatureは警告してスキップ（ファイル全体は生かす）
        warnings.push(tr('warningFeatureInvalid', { index: idx, id: gj.id != null ? gj.id : '', errors: e.message }));
        return;
      }
      if (!f.type) {
        warnings.push(tr('warningGeoJSONGeometry', { index: idx, geomType: (gj.geometry && gj.geometry.type) || '(none)' }));
        return;
      }
      if (!f.tag) f.tag = '__uncategorized__';
      if (f.id == null || f.id === '') {
        f.id = nextFreeId(f.type, usedIds);
        usedIds[f.id] = true;
      } else if (assignedIds[f.id]) {
        var dup = f.id;
        f.id = nextFreeId(f.type, usedIds);
        usedIds[f.id] = true;
        warnings.push(tr('warningDuplicateId', { index: idx, id: dup, newId: f.id }));
      }
      var v = validateFeature(f);
      if (!v.ok) {
        warnings.push(tr('warningFeatureInvalid', { index: idx, id: f.id, errors: v.errors.join(' / ') }));
        return;
      }
      assignedIds[f.id] = true;
      features.push(f);
    });

    // features に現れたタグIDからタグ定義を自動生成
    var tags = [];
    var seenTags = {};
    features.forEach(function (f) {
      if (seenTags[f.tag]) return;
      seenTags[f.tag] = true;
      if (f.tag === '__uncategorized__') {
        tags.push({ id: '__uncategorized__', name: tr('uncategorized'), color: '#9e9e9e' });
      } else {
        tags.push({ id: f.tag, name: f.tag, color: TAG_PALETTE[(tags.length) % TAG_PALETTE.length] });
      }
    });

    return { meta: {}, view: null, tags: tags, features: features, warnings: warnings };
  }

  /* type別プレフィクス(p/l/g)＋連番で、usedIdsと衝突しないIDを返す */
  function nextFreeId(type, usedIds) {
    var p = (type === 'point' ? 'p' : type === 'line' ? 'l' : 'g');
    var n = 1, id;
    do {
      id = p + (n < 100 ? ('00' + n).slice(-3) : String(n));
      n++;
    } while (usedIds[id]);
    return id;
  }

  /* 内部構造（state）→ YAMLテキスト */
  function dumpYaml(state) {
    var out = {
      version: 2,
      meta: state.meta || {},
      view: state.view || DEFAULT_VIEW,
      tags: mapToArray(state.tags),
      features: mapToArray(state.features)
    };
    return global.jsyaml.dump(out, { lineWidth: 120, noRefs: true });
  }

  function mapToArray(m) {
    if (!m) return [];
    if (m instanceof Map) return Array.from(m.values());
    if (Array.isArray(m)) return m;
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  /* [緯度,経度] → GeoJSON [経度,緯度] へ並び替えて返す */
  function toGeoJSON(feature) {
    var geom;
    if (feature.type === 'point') {
      geom = { type: 'Point', coordinates: [feature.coordinates[1], feature.coordinates[0]] };
    } else if (feature.type === 'line') {
      geom = { type: 'LineString', coordinates: feature.coordinates.map(swap) };
    } else if (feature.type === 'polygon') {
      var rings = feature.coordinates.map(function (ring) {
        var r = ring.map(swap);
        // GeoJSONリングは閉じる
        if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) {
          r.push(r[0]);
        }
        return r;
      });
      geom = { type: 'Polygon', coordinates: rings };
    }
    return {
      type: 'Feature',
      id: feature.id,
      properties: Object.assign({ id: feature.id, name: feature.name, tag: feature.tag, _type: feature.type }, feature.properties || {}),
      geometry: geom
    };
  }

  function swap(p) { return [p[1], p[0]]; }

  /* GeoJSON Feature → 内部フィーチャ（[経度,緯度]→[緯度,経度]） */
  function fromGeoJSON(gj, meta) {
    var g = gj.geometry || {};
    var rawId = gj.id != null ? gj.id : (gj.properties && gj.properties.id);
    var f = {
      // 数値ID/タグはMapキーや検索で文字列として扱うため正規化する
      id: rawId != null ? String(rawId) : undefined,
      name: (gj.properties && gj.properties.name) || '',
      properties: {}
    };
    if (gj.properties) {
      Object.keys(gj.properties).forEach(function (k) {
        if (['id', 'name', 'tag', '_type'].indexOf(k) === -1) f.properties[k] = gj.properties[k];
      });
      f.tag = gj.properties.tag != null && gj.properties.tag !== '' ? String(gj.properties.tag) : '__uncategorized__';
    }
    if (g.type === 'Point') {
      f.type = 'point';
      f.coordinates = [g.coordinates[1], g.coordinates[0]];
    } else if (g.type === 'LineString') {
      f.type = 'line';
      f.coordinates = g.coordinates.map(swap);
    } else if (g.type === 'Polygon') {
      f.type = 'polygon';
      f.coordinates = g.coordinates.map(function (ring) {
        var r = ring.map(swap);
        // GeoJSONの閉じたリングを内部表現（開いたリング）へ戻す
        if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
        return r;
      });
    }
    return f;
  }

  global.Store = {
    DEFAULT_VIEW: DEFAULT_VIEW,
    validateFeature: validateFeature,
    parseYaml: parseYaml,
    parseGeoJSON: parseGeoJSON,
    dumpYaml: dumpYaml,
    toGeoJSON: toGeoJSON,
    fromGeoJSON: fromGeoJSON,
    mapToArray: mapToArray
  };
})(typeof window !== 'undefined' ? window : this);
