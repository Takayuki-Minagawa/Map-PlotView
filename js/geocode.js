/* geocode.js — 場所検索（国土地理院 住所検索API）と標高取得（同 標高API）
 * どちらも利用者の明示操作（検索の確定・ボタン押下）でのみ呼び出すこと。
 * 過度な負荷を掛ける利用は禁止されているため、入力中の逐次検索はしない。
 */
(function (global) {
  'use strict';

  var ADDRESS_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';
  var ELEVATION_URL = 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php';
  var DEFAULT_LIMIT = 20;

  function inLat(n) { return isFinite(n) && n >= -90 && n <= 90; }
  function inLng(n) { return isFinite(n) && n >= -180 && n <= 180; }

  /* "35.681, 139.767" のような緯度経度の直接入力を解釈する。該当しなければnull。
   * 全角の数字・カンマも受け付ける。"1,000" や "100 0001"（郵便番号）を座標と誤認しないよう、
   * 少なくとも一方に小数点があることを条件とする。
   * 1つ目が緯度の範囲外で経度としてのみ成立する場合は「経度, 緯度」とみなして入れ替える。 */
  function parseLatLngQuery(query) {
    var q = String(query || '');
    if (q.normalize) q = q.normalize('NFKC');
    var m = /^\s*([-+]?\d+(?:\.\d+)?)\s*(?:[,、\s])\s*([-+]?\d+(?:\.\d+)?)\s*$/.exec(q);
    if (!m || (m[1].indexOf('.') === -1 && m[2].indexOf('.') === -1)) return null;
    var a = parseFloat(m[1]), b = parseFloat(m[2]);
    if (inLat(a) && inLng(b)) return [a, b];
    if (inLng(a) && inLat(b)) return [b, a];
    return null;
  }

  /* 住所検索APIの応答（GeoJSON Featureの配列）→ [{title, lat, lng}]。不正な要素は捨てる。
   * query を渡すと名称の一致度順に並べ替えてから limit 件に絞る（APIの応答は一致度順ではなく、
   * 例えば「東京駅」の本命が50件目以降に来るため）。 */
  function parseAddressResults(json, limit, query) {
    var max = limit > 0 ? limit : DEFAULT_LIMIT;
    var out = [];
    if (!Array.isArray(json)) return out;
    for (var i = 0; i < json.length; i++) {
      var item = json[i];
      var c = item && item.geometry && item.geometry.coordinates;
      if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
      if (!inLng(c[0]) || !inLat(c[1])) continue;
      var title = item.properties && item.properties.title;
      out.push({ title: title != null ? String(title) : '', lat: c[1], lng: c[0] });
    }
    return rankByTitle(out, query).slice(0, max);
  }

  /* 完全一致 → 前方一致 → 部分一致 → その他 の順に安定ソートする */
  function rankByTitle(results, query) {
    var q = String(query || '').trim();
    if (!q) return results;
    var score = function (r) {
      var i = r.title.indexOf(q);
      return r.title === q ? 0 : i === 0 ? 1 : i > 0 ? 2 : 3;
    };
    return results
      .map(function (r, i) { return { r: r, s: score(r), i: i }; })
      .sort(function (a, b) { return a.s - b.s || a.i - b.i; })
      .map(function (x) { return x.r; });
  }

  /* 住所・地名を検索して候補を返す。opts: { signal: AbortSignal, limit: 件数上限 } */
  function searchAddress(query, opts) {
    opts = opts || {};
    var q = String(query || '').trim();
    if (!q) return Promise.resolve([]);
    return global.fetch(ADDRESS_URL + encodeURIComponent(q), { signal: opts.signal })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) { return parseAddressResults(json, opts.limit, q); });
  }

  /* 標高APIの応答 → {elevation: m, source: データソース名}。データ無し（"-----"）はnull。 */
  function parseElevation(json) {
    if (!json || typeof json.elevation !== 'number' || !isFinite(json.elevation)) return null;
    return { elevation: json.elevation, source: json.hsrc != null ? String(json.hsrc) : '' };
  }

  /* 指定地点の標高を取得する。データの無い地点（海上など）はnullで解決する。 */
  function getElevation(lat, lng) {
    var url = ELEVATION_URL + '?lon=' + encodeURIComponent(lng) + '&lat=' + encodeURIComponent(lat) + '&outtype=JSON';
    return global.fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(parseElevation);
  }

  global.Geo = {
    parseLatLngQuery: parseLatLngQuery,
    parseAddressResults: parseAddressResults,
    searchAddress: searchAddress,
    parseElevation: parseElevation,
    getElevation: getElevation
  };
})(typeof window !== 'undefined' ? window : this);
