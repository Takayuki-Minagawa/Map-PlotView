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

  /* 計測の地球半径（平均半径）。turf 7 の length / area と同じ値にして結果を揃える */
  var EARTH_RADIUS = 6371008.8;
  var RAD = Math.PI / 180;

  /* 2点 [緯度,経度] 間の大円距離（m, haversine） */
  function distance(a, b) {
    var dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD;
    var h = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  /* 頂点列 [[緯度,経度], ...] の総延長（m）。closed なら終点→始点も足す（面の周長） */
  function pathLength(points, closed) {
    var total = 0;
    for (var i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
    if (closed && points.length > 2) total += distance(points[points.length - 1], points[0]);
    return total;
  }

  /* リング [[緯度,経度], ...]（閉じていても開いていてもよい）の球面上の面積（m², 向きによらず正）。
   * turf.area と同じ Chamberlain & Duquette の式。 */
  function ringArea(ring) {
    var pts = ring.slice();
    var n = pts.length;
    if (n > 1 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1]) { pts.pop(); n--; }
    if (n < 3) return 0;
    var total = 0;
    for (var i = 0; i < n; i++) {
      var lower = pts[i], middle = pts[(i + 1) % n], upper = pts[(i + 2) % n];
      total += (upper[1] - lower[1]) * RAD * Math.sin(middle[0] * RAD);
    }
    return Math.abs(total * EARTH_RADIUS * EARTH_RADIUS / 2);
  }

  /* 面（外周リング＋穴）の面積（m²） */
  function polygonArea(rings) {
    return (rings || []).reduce(function (sum, ring, i) {
      var a = ringArea(ring);
      return i === 0 ? sum + a : sum - a;
    }, 0);
  }

  /* フィーチャの計測（線: 長さkm / 面: 面積m²・周長m） */
  function measure(feature) {
    var out = {};
    try {
      if (feature.type === 'line') out.length = pathLength(feature.coordinates) / 1000;
      if (feature.type === 'polygon') {
        out.area = Math.max(0, polygonArea(feature.coordinates));
        out.perimeter = pathLength(feature.coordinates[0], true);
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  global.Select = {
    selectInBounds: selectInBounds,
    measure: measure,
    distance: distance,
    pathLength: pathLength,
    ringArea: ringArea,
    polygonArea: polygonArea
  };
})(typeof window !== 'undefined' ? window : this);
