/* select.js — 範囲抽出（矩形との空間判定, turf.js） */
(function (global) {
  'use strict';

  /* rectGeoJSON: boundsToGeoJSON 由来の Polygon Feature
   * features: 内部フィーチャ配列
   * opts: { mode:'intersect'|'within', respectHidden:bool, isHidden:fn(feature)->bool }
   * 戻り値: 一致した feature.id の配列
   */
  function selectInBounds(rectGeoJSON, features, opts) {
    opts = opts || {};
    var mode = opts.mode === 'within' ? 'within' : 'intersect';
    var turf = global.turf;
    var rectPoly = rectGeoJSON.type === 'Feature' ? rectGeoJSON : { type: 'Feature', properties: {}, geometry: rectGeoJSON.geometry || rectGeoJSON };
    var bbox = rectGeoJSON.bbox || (turf ? turf.bbox(rectPoly) : null);

    var ids = [];
    features.forEach(function (f) {
      if (opts.respectHidden && opts.isHidden && opts.isHidden(f)) return;
      var gj = global.Store.toGeoJSON(f);
      var hit = false;
      try {
        if (f.type === 'point') {
          if (turf) {
            hit = turf.booleanPointInPolygon(gj.geometry, rectPoly.geometry || rectPoly);
          } else if (bbox) {
            var lng = gj.geometry.coordinates[0], lat = gj.geometry.coordinates[1];
            hit = lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
          }
        } else {
          if (turf) {
            if (mode === 'within') {
              hit = turf.booleanWithin(gj, rectPoly);
            } else {
              hit = turf.booleanIntersects(gj, rectPoly);
            }
          } else if (bbox) {
            hit = geomBboxOverlap(gj.geometry, bbox);
          }
        }
      } catch (e) {
        hit = false;
      }
      if (hit) ids.push(f.id);
    });
    return ids;
  }

  // turf不在時の粗い線/面フォールバック（頂点のいずれかがbbox内なら交差とみなす）
  function geomBboxOverlap(geom, bbox) {
    var coords = flatten(geom.coordinates);
    return coords.some(function (c) {
      return c[0] >= bbox[0] && c[0] <= bbox[2] && c[1] >= bbox[1] && c[1] <= bbox[3];
    });
  }

  function flatten(arr) {
    if (typeof arr[0] === 'number') return [arr];
    return arr.reduce(function (acc, x) { return acc.concat(flatten(x)); }, []);
  }

  /* 抽出結果の計測（長さ/面積）を返す。turfがあれば利用。 */
  function measure(feature) {
    var turf = global.turf;
    if (!turf) return {};
    var gj = global.Store.toGeoJSON(feature);
    var out = {};
    try {
      if (feature.type === 'line') out.length = turf.length(gj, { units: 'kilometers' });
      if (feature.type === 'polygon') out.area = turf.area(gj);
    } catch (e) { /* ignore */ }
    return out;
  }

  global.Select = { selectInBounds: selectInBounds, measure: measure };
})(typeof window !== 'undefined' ? window : this);
