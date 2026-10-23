/* store.js — データモデル / YAML・GeoJSON・CSV⇄内部構造 / 検証 / 入出力ヘルパ
 * グローバル名前空間 window.Store に公開（ES modulesを使わず file:// 直開きに対応）。
 */
(function (global) {
  'use strict';

  var DEFAULT_VIEW = {
    center: [35.681, 139.767],
    zoom: 13,
    baseLayer: 'pale',
    overlays: [],
    overlayOpacity: 0.85
  };
  /* タグ未指定・未定義タグのフィーチャを受けるシステムタグ */
  var UNCATEGORIZED_ID = '__uncategorized__';
  var tr = function (key, vars) { return global.I18n ? global.I18n.t(key, vars) : key; };

  function uncategorizedTag() {
    return { id: UNCATEGORIZED_ID, name: tr('uncategorized'), color: '#9e9e9e' };
  }

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function isPlainObject(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o) && !(o instanceof Date);
  }

  /* プロトタイプ由来のキー（constructor, toString 等）と衝突しない参照表 */
  function dict() { return Object.create(null); }

  /* CSSへ埋め込んでよい色表記か（#hex / 色名 / rgb()・hsl() などの色関数）。
   * url() や var()、宣言の区切り(;)を含むものは通さない。外部ファイル由来の値をstyle属性へ入れる前に確認する。 */
  function isSafeColor(c) {
    return typeof c === 'string' &&
      /^(#[0-9a-f]{3,8}|[a-z]+|(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([0-9a-z.,%\s/+-]+\))$/i.test(c.trim());
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

  /* タイムスタンプを Date に変換しないYAMLスキーマ。
   * 既定スキーマでは `2026-03-02T04:15:00+09:00` が Date になり、保存時にUTC表記へ書き換わってしまう。
   * 文字列のまま保持して、読込→保存で元の表記を維持する。 */
  var yamlSchemaCache;
  function yamlSchema() {
    if (yamlSchemaCache !== undefined) return yamlSchemaCache;
    var y = global.jsyaml;
    yamlSchemaCache = null;
    if (y && y.CORE_SCHEMA && typeof y.CORE_SCHEMA.extend === 'function') {
      // 既定スキーマとの差は「タイムスタンプの暗黙変換をしない」ことだけにする。
      // !!timestamp / !!binary など明示タグ付きの値は従来どおり読めるよう explicit に残す。
      var t = y.types || {};
      var only = function (list) { return list.filter(Boolean); };
      yamlSchemaCache = y.CORE_SCHEMA.extend({
        implicit: only([t.merge]),
        explicit: only([t.binary, t.omap, t.pairs, t.set, t.timestamp])
      });
    }
    return yamlSchemaCache;
  }
  function yamlOptions(base) {
    var schema = yamlSchema();
    if (schema) base.schema = schema;
    return base;
  }

  /* view を既定値で補完し、不正な値（範囲外の中心座標など）は既定値に置き換える */
  function normalizeView(raw) {
    var v = Object.assign({}, DEFAULT_VIEW);
    if (!isPlainObject(raw)) return v;
    if (isLatLng(raw.center)) v.center = raw.center;
    if (isFiniteNumber(raw.zoom) && raw.zoom >= 0 && raw.zoom <= 22) v.zoom = raw.zoom;
    if (typeof raw.baseLayer === 'string') v.baseLayer = raw.baseLayer;
    if (Array.isArray(raw.overlays)) {
      v.overlays = raw.overlays.filter(function (k) { return typeof k === 'string'; });
    }
    if (isFiniteNumber(raw.overlayOpacity) && raw.overlayOpacity >= 0 && raw.overlayOpacity <= 1) {
      v.overlayOpacity = raw.overlayOpacity;
    }
    return v;
  }

  /* 検証済みフィーチャを複製し、画面側が前提とする型へ揃える（ID/タグ/名称/メモは文字列） */
  function normalizeFeature(raw) {
    var f = Object.assign({}, raw);
    f.id = String(raw.id);
    f.tag = (raw.tag == null || raw.tag === '') ? UNCATEGORIZED_ID : String(raw.tag);
    if (raw.name != null && typeof raw.name !== 'string') f.name = String(raw.name);
    if (raw.note != null && typeof raw.note !== 'string') f.note = String(raw.note);
    if (raw.properties != null && !isPlainObject(raw.properties)) f.properties = {};
    if (raw.photos != null) {
      f.photos = Array.isArray(raw.photos)
        ? raw.photos.filter(function (p) { return isPlainObject(p) && typeof p.src === 'string'; })
        : [];
      if (!f.photos.length) delete f.photos;
    }
    return f;
  }

  /* YAMLテキスト → 内部構造。検証エラーは warnings として収集（致命的でなければ読み込む）。 */
  function parseYaml(text) {
    var doc;
    try {
      doc = global.jsyaml.load(text, yamlOptions({}));
    } catch (e) {
      throw new Error(tr('yamlSyntaxError', { message: e.message }));
    }
    if (!isPlainObject(doc)) {
      throw new Error(tr('yamlEmptyError'));
    }
    var warnings = [];
    var meta = isPlainObject(doc.meta) ? doc.meta : {};
    var view = normalizeView(doc.view);

    var tags = [];
    var tagIds = dict();
    (Array.isArray(doc.tags) ? doc.tags : []).forEach(function (t, idx) {
      if (!isPlainObject(t) || t.id == null || t.id === '') {
        warnings.push(tr('warningTagInvalid', { index: idx }));
        return;
      }
      var id = String(t.id);
      if (tagIds[id]) {
        warnings.push(tr('warningDuplicateTag', { index: idx, id: id }));
        return;
      }
      tagIds[id] = true;
      var tag = Object.assign({}, t, { id: id });
      if (tag.color != null && !isSafeColor(tag.color)) {
        warnings.push(tr('warningTagColor', { index: idx, id: id }));
        delete tag.color; // 描画側の既定色を使う
      }
      tags.push(tag);
    });

    var rawFeatures = Array.isArray(doc.features) ? doc.features : [];
    var ids = createIdAllocator(rawFeatures.map(function (f) { return f && f.id; }));
    var features = [];
    rawFeatures.forEach(function (raw, idx) {
      var v = validateFeature(raw);
      if (!v.ok) {
        warnings.push(tr('warningFeatureInvalid', { index: idx, id: (raw && raw.id), errors: v.errors.join(' / ') }));
        return; // 不正なフィーチャはスキップ
      }
      var f = normalizeFeature(raw);
      // tag が未定義なら未分類へ
      if (f.tag !== UNCATEGORIZED_ID && !tagIds[f.tag]) {
        warnings.push(tr('warningUnknownTag', { index: idx, id: f.id, tag: f.tag }));
        f.tag = UNCATEGORIZED_ID;
      }
      var dup = ids.ensure(f);
      if (dup != null) warnings.push(tr('warningDuplicateId', { index: idx, id: dup, newId: f.id }));
      ids.commit(f.id);
      features.push(f);
    });

    // 未分類タグを必要に応じて追加
    var hasUncat = features.some(function (f) { return f.tag === UNCATEGORIZED_ID; });
    if (hasUncat && !tagIds[UNCATEGORIZED_ID]) tags.push(uncategorizedTag());

    return { meta: meta, view: view, tags: tags, features: features, warnings: warnings };
  }

  /* インポート時にタグへ割り当てる色 */
  var TAG_PALETTE = ['#2e7d32', '#1565c0', '#ef6c00', '#6a1b9a', '#c62828', '#00838f', '#9e9d24', '#4e342e'];

  /* GeoJSONテキスト → 内部構造。parseYamlと同じ形 {meta, view, tags, features, warnings} を返す。
   * viewはnull（表示位置の情報を持たない。呼び出し側で全体表示などを行う）。properties.tag からタグを自動生成する。 */
  function parseGeoJSON(text) {
    var doc;
    try {
      doc = JSON.parse(String(text == null ? '' : text).replace(/^\ufeff/, ''));
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
    var reserved = [];
    rawFeatures.forEach(function (gj) {
      if (!gj) return;
      reserved.push(gj.id);
      if (gj.properties) reserved.push(gj.properties.id);
    });
    var ids = createIdAllocator(reserved);

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
      if (!f.tag) f.tag = UNCATEGORIZED_ID;
      var dup = ids.ensure(f);
      if (dup != null) warnings.push(tr('warningDuplicateId', { index: idx, id: dup, newId: f.id }));
      var v = validateFeature(f);
      if (!v.ok) {
        warnings.push(tr('warningFeatureInvalid', { index: idx, id: f.id, errors: v.errors.join(' / ') }));
        return;
      }
      ids.commit(f.id);
      features.push(f);
    });

    return { meta: {}, view: null, tags: tagsFromFeatures(features), features: features, warnings: warnings };
  }

  /* CSVの列名（小文字・前後空白除去後）→ 内部フィールドの対応 */
  var CSV_ALIASES = {
    id: ['id'],
    name: ['name', 'title', '名称', '名前'],
    tag: ['tag', 'タグ'],
    type: ['type'],
    lat: ['lat', 'latitude', '緯度'],
    lng: ['lng', 'lon', 'long', 'longitude', '経度'],
    note: ['note', 'メモ', '備考']
  };

  /* 本アプリのCSV出力が type 列に書く「点以外」の値。これらの行は形状を復元できないので取り込まない。 */
  var CSV_NON_POINT_TYPES = ['line', 'polygon', '線', '面'];
  var CSV_POINT_TYPES = ['', 'point', '点'];

  /* CSVテキスト → 内部構造（点のみ）。1行目を見出しとし、緯度・経度の列が必須。
   * 認識できない列は表示項目(properties)として取り込む。区切りは , ; タブを自動判定。 */
  function parseCSV(text) {
    var src = String(text == null ? '' : text).replace(/^\ufeff/, '');
    // Excelが付ける区切り指定行（sep=;）があればそれに従う
    var sep = /^sep=(.)(\r\n|\r|\n)/i.exec(src);
    if (sep) src = src.slice(sep[0].length);
    var parsed = parseCSVRows(src, sep ? sep[1] : detectDelimiter(src));
    var rows = parsed.rows;
    var lineOf = function (i) { return parsed.lines[i] + (sep ? 1 : 0); };
    var header = null, headerRow = 0;
    for (var r = 0; r < rows.length; r++) {
      if (!isBlankRow(rows[r])) { header = rows[r]; headerRow = r; break; }
    }
    if (!header) throw new Error(tr('csvEmptyError'));

    // 見出し → 列番号。同じ項目の別名が複数あるときは CSV_ALIASES の並び順（先頭ほど優先）で決める。
    var names = header.map(function (h) { return String(h).trim(); });
    var lower = names.map(function (h) { return h.toLowerCase(); });
    var col = {};
    Object.keys(CSV_ALIASES).forEach(function (field) {
      for (var a = 0; a < CSV_ALIASES[field].length; a++) {
        var i = lower.indexOf(CSV_ALIASES[field][a]);
        if (i !== -1) { col[field] = i; return; }
      }
    });
    if (col.lat == null || col.lng == null) throw new Error(tr('csvNoLatLngError'));

    var cell = function (row, field) {
      return col[field] == null ? '' : String(row[col[field]] == null ? '' : row[col[field]]).trim();
    };
    var dataRows = [];
    rows.forEach(function (row, i) {
      if (i > headerRow && !isBlankRow(row)) dataRows.push({ row: row, line: lineOf(i) });
    });
    if (!dataRows.length) throw new Error(tr('csvEmptyError'));

    var warnings = [];
    var features = [];
    var ids = createIdAllocator(dataRows.map(function (d) { return cell(d.row, 'id'); }));
    dataRows.forEach(function (d) {
      var row = d.row;
      var type = cell(row, 'type');
      if (CSV_NON_POINT_TYPES.indexOf(type.toLowerCase()) !== -1) {
        // 線・面は代表点しか持たないため復元できない
        warnings.push(tr('warningCsvNonPoint', { row: d.line, type: type }));
        return;
      }
      // type列が形状種別でない値（「小学校」等の分類）なら、ふつうの表示項目として扱う
      var typeIsProperty = CSV_POINT_TYPES.indexOf(type.toLowerCase()) === -1;
      var f = {
        id: cell(row, 'id') || undefined,
        type: 'point',
        tag: cell(row, 'tag') || UNCATEGORIZED_ID,
        name: cell(row, 'name'),
        coordinates: [global.Util.toNumber(cell(row, 'lat')), global.Util.toNumber(cell(row, 'lng'))],
        properties: {}
      };
      var note = cell(row, 'note');
      if (note) f.note = note;
      names.forEach(function (h, i) {
        if (!h) return;
        var isField = Object.keys(col).some(function (k) { return col[k] === i; });
        if (isField && !(i === col.type && typeIsProperty)) return;
        var v = String(row[i] == null ? '' : row[i]).trim();
        if (v !== '') f.properties[h] = global.Util.parseScalar(v);
      });
      var dup = ids.ensure(f);
      if (dup != null) warnings.push(tr('warningCsvDuplicateId', { row: d.line, id: dup, newId: f.id }));
      var v = validateFeature(f);
      if (!v.ok) {
        warnings.push(tr('warningCsvRow', { row: d.line, errors: v.errors.join(' / ') }));
        return;
      }
      ids.commit(f.id);
      features.push(f);
    });

    return { meta: {}, view: null, tags: tagsFromFeatures(features), features: features, warnings: warnings };
  }

  function isBlankRow(row) {
    return row.every(function (c) { return String(c).trim() === ''; });
  }

  /* 最初の空でない行（見出し行）に最も多く現れる区切り文字を採用（引用符の外側のみ数える） */
  function detectDelimiter(text) {
    var counts = { ',': 0, '\t': 0, ';': 0 };
    var inQuote = false, seen = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (!inQuote && (ch === '\n' || ch === '\r')) {
        if (seen) break; // 空白だけの行は読み飛ばす
        counts[','] = counts['\t'] = counts[';'] = 0;
        continue;
      }
      if (ch === '"') { inQuote = !inQuote; seen = true; }
      else if (!inQuote && counts[ch] != null) counts[ch]++;
      else if (!/\s/.test(ch)) seen = true; // 全角空白なども空行扱い
    }
    if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) return '\t';
    if (counts[';'] > counts[',']) return ';';
    return ',';
  }

  /* RFC 4180 準拠のCSV分解（引用符内の区切り・改行・"" エスケープに対応）。
   * {rows: 行の配列, lines: 各行が始まるファイル上の行番号(1始まり)} を返す。閉じていない引用符はthrow。 */
  function parseCSVRows(text, delim) {
    var rows = [], lines = [], row = [], cell = '';
    var inQuote = false, i = 0, n = text.length;
    var line = 1, rowLine = 1, quoteLine = 0;
    while (i < n) {
      var ch = text[i];
      if (inQuote) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQuote = false;
        } else {
          if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++;
          cell += ch;
        }
        i++;
        continue;
      }
      if (ch === '"' && cell === '') { inQuote = true; quoteLine = line; i++; continue; }
      if (ch === delim) { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); lines.push(rowLine);
        row = []; cell = '';
        line++; rowLine = line;
        i++;
        continue;
      }
      cell += ch;
      i++;
    }
    if (inQuote) throw new Error(tr('csvUnclosedQuoteError', { row: quoteLine }));
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); lines.push(rowLine); }
    return { rows: rows, lines: lines };
  }

  /* ---- KML / GPX（XML） ---- */

  /* XMLテキスト → Document。ブラウザの DOMParser を使う（テストでは xmldom を注入する）。 */
  function parseXml(text) {
    var Parser = global.DOMParser;
    if (!Parser) throw new Error(tr('xmlUnsupportedError'));
    var doc;
    try {
      // XML宣言の前に空白・改行がある書き出し（サーバ生成のファイルなど）も読めるよう先頭の空白を除く
      doc = new Parser({ onError: function () {} }).parseFromString(String(text == null ? '' : text).replace(/^[\ufeff\s]+/, ''), 'application/xml');
    } catch (e) {
      throw new Error(tr('xmlSyntaxError', { message: e.message }));
    }
    // ブラウザは例外を投げず、<parsererror> 要素を含む文書を返す
    var err = doc && doc.getElementsByTagName('parsererror')[0];
    if (!doc || !doc.documentElement || err) {
      // Chrome/Safari は定型の前置き＋エラー内容＋後置きの文を返すので、エラー内容の行だけを出す
      var detail = err ? String(err.textContent || '').replace(/^\s*This page contains the following errors:/, '').trim().split('\n')[0] : '';
      throw new Error(tr('xmlSyntaxError', { message: detail.replace(/Below is a rendering.*$/, '').trim() }));
    }
    return doc;
  }

  /* 名前空間接頭辞（kml: / gx: など）を除いた要素名 */
  function localName(node) {
    return node.localName || String(node.nodeName || '').replace(/^.*:/, '');
  }

  /* 直下の子要素（name 指定時はその名前のものだけ） */
  function childElements(el, name) {
    var out = [];
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && (!name || localName(c) === name)) out.push(c);
    }
    return out;
  }

  function childText(el, name) {
    var c = childElements(el, name)[0];
    return c ? String(c.textContent || '').trim() : '';
  }

  /* 子孫要素を文書順に集める */
  function descendants(el, name, out) {
    out = out || [];
    childElements(el).forEach(function (c) {
      if (localName(c) === name) out.push(c);
      descendants(c, name, out);
    });
    return out;
  }

  function xmlAttr(el, name) {
    var v = el.getAttribute(name);
    return v == null ? '' : String(v).trim();
  }

  /* 座標の数値。他のツールが書く指数表記（1.397e2 など）も受け付ける。空文字や数値でないものはNaN */
  function coordNumber(s) {
    var v = String(s == null ? '' : s).trim();
    return /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i.test(v) ? parseFloat(v) : NaN;
  }

  function latLngOf(lat, lng) {
    return [global.Util.round(coordNumber(lat)), global.Util.round(coordNumber(lng))];
  }

  /* 閉じたリング（始点＝終点）を内部表現の開いたリングへ */
  function openRing(r) {
    var n = r.length;
    if (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) return r.slice(0, -1);
    return r;
  }

  /* <coordinates>経度,緯度[,高さ] …</coordinates> → [[緯度,経度], …] */
  function kmlCoords(el) {
    if (!el) return [];
    // 区切りは空白。「139.7, 35.6」のようにカンマの前後へ空白を入れた書き出しもあるので先に詰める
    return String(el.textContent || '').replace(/\s*,\s*/g, ',').trim().split(/\s+/).filter(Boolean).map(function (tuple) {
      var p = tuple.split(',');
      return latLngOf(p[1], p[0]);
    });
  }

  /* 要素の直下にある形状を集める（MultiGeometry / gx:MultiTrack は展開する）。
   * 戻り値の要素は {type, coordinates} または未対応の {unsupported: 要素名}。 */
  function kmlGeometries(el, out) {
    childElements(el).forEach(function (g) {
      var n = localName(g);
      var coordsEl = childElements(g, 'coordinates')[0];
      if (n === 'Point') {
        out.push({ type: 'point', coordinates: kmlCoords(coordsEl)[0] });
      } else if (n === 'LineString') {
        out.push({ type: 'line', coordinates: kmlCoords(coordsEl) });
      } else if (n === 'LinearRing') {
        out.push({ type: 'polygon', coordinates: [openRing(kmlCoords(coordsEl))] });
      } else if (n === 'Polygon') {
        var rings = [];
        childElements(g, 'outerBoundaryIs').concat(childElements(g, 'innerBoundaryIs')).forEach(function (b, bi) {
          childElements(b, 'LinearRing').forEach(function (r) {
            var ring = openRing(kmlCoords(childElements(r, 'coordinates')[0]));
            if (ring.length || bi === 0) rings.push(ring); // 中身の無い穴は捨てる（外周は検証に任せる）
          });
        });
        out.push({ type: 'polygon', coordinates: rings });
      } else if (n === 'Track') {
        // gx:Track: <gx:coord>経度 緯度 高さ</gx:coord> の並び
        out.push({
          type: 'line',
          coordinates: childElements(g, 'coord').map(function (c) {
            var p = String(c.textContent || '').trim().split(/\s+/);
            return latLngOf(p[1], p[0]);
          })
        });
      } else if (n === 'MultiGeometry' || n === 'MultiTrack') {
        kmlGeometries(g, out);
      } else if (n === 'Model') {
        out.push({ unsupported: n });
      }
    });
    return out;
  }

  /* ExtendedData（Data / SchemaData）→ 表示項目 */
  function kmlProperties(pm) {
    var props = {};
    childElements(pm, 'ExtendedData').forEach(function (ext) {
      descendants(ext, 'Data').forEach(function (d) {
        var k = xmlAttr(d, 'name');
        if (k) props[k] = global.Util.parseScalar(childText(d, 'value'));
      });
      descendants(ext, 'SimpleData').forEach(function (d) {
        var k = xmlAttr(d, 'name');
        if (k) props[k] = global.Util.parseScalar(String(d.textContent || '').trim());
      });
    });
    return props;
  }

  /* KMLの色 aabbggrr → '#rrggbb'（不正ならnull） */
  function kmlColorToHex(c) {
    var m = /^\s*#?([0-9a-f]{8})\s*$/i.exec(String(c || ''));
    if (!m) return null;
    var h = m[1].toLowerCase();
    return '#' + h.slice(6, 8) + h.slice(4, 6) + h.slice(2, 4);
  }

  /* Style 要素の代表色（アイコン → 線 → 塗り の順） */
  function styleColor(style) {
    var kinds = ['IconStyle', 'LineStyle', 'PolyStyle'];
    for (var i = 0; i < kinds.length; i++) {
      var el = childElements(style, kinds[i])[0];
      var raw = el ? childText(el, 'color') : '';
      var c = kmlColorToHex(raw);
      if (c && !/^\s*#?00/.test(raw)) return c; // 透明（非表示）の指定は代表色にしない
    }
    return null;
  }

  /* 文書内の共有スタイル → { '#id': '#rrggbb' }。StyleMap は normal のスタイルを指す（Google マイマップ等） */
  function kmlStyleColors(doc) {
    var colors = dict();
    descendants(doc.documentElement, 'Style').forEach(function (st) {
      var id = xmlAttr(st, 'id');
      var c = id && styleColor(st);
      if (c) colors['#' + id] = c;
    });
    descendants(doc.documentElement, 'StyleMap').forEach(function (sm) {
      var id = xmlAttr(sm, 'id');
      if (!id) return;
      childElements(sm, 'Pair').forEach(function (pair) {
        if (childText(pair, 'key') !== 'normal') return;
        var c = colors[childText(pair, 'styleUrl')];
        if (c) colors['#' + id] = c;
      });
    });
    return colors;
  }

  /* Placemark の色（直下の Style → styleUrl の共有スタイル） */
  function placemarkColor(pm, colors) {
    var inline = childElements(pm, 'Style')[0];
    var c = inline && styleColor(inline);
    if (c) return c;
    var url = childText(pm, 'styleUrl'); // 同一文書内の参照（#id）だけを見る（他ファイルの style は読めない）
    return url.charAt(0) === '#' ? colors[url] || null : null;
  }

  /* 最も近い親 Folder の名称 */
  function kmlFolderName(el) {
    for (var p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      if (localName(p) === 'Folder') return childText(p, 'name');
    }
    return '';
  }

  var HTML_ENTITIES = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

  /* KMLの description（HTMLのことが多い）→ メモ用のプレーンテキスト。
   * HTMLでは生の改行は空白と同じなので、改行は <br> や段落・表の行の終わりから作る（本アプリの書出もこの形）。 */
  function descriptionToText(s) {
    var text = String(s || '');
    // 実体参照だけで判断するのは改行を含まない場合に限る（改行入りのプレーンテキストの改行を消さない）
    var isHtml = /<[a-z!/][^>]*>/i.test(text) || (!/\n/.test(text) && /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text));
    if (!isHtml) return text.trim();
    return text
      .replace(/>\s*\n\s*/g, '>').replace(/\s*\n\s*</g, '<') // タグの間の整形用の改行・字下げは捨てる
      .replace(/[ \t]*\r?\n[ \t]*/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<[^>]*>/g, '')
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, function (m, e) {
        if (e.charAt(0) === '#') {
          var code = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
        }
        var k = e.toLowerCase();
        return Object.prototype.hasOwnProperty.call(HTML_ENTITIES, k) ? HTML_ENTITIES[k] : m;
      })
      .replace(/[ \t]+\n/g, '\n')
      .replace(/^\s+|\s+$/g, '');
  }

  /* KMLテキスト → 内部構造。Placemark の点・線・面（穴あり）を取り込む。
   * タグは ExtendedData の tag（本アプリの書出）→ 親 Folder の名称 → 未分類 の順に決める。 */
  function parseKML(text) {
    var src = String(text == null ? '' : text);
    // gx: 拡張（gx:Track など）を名前空間の宣言なしで使う書き出しがあり、そのままでは構文エラーになるので補う
    if (/<\/?gx:/.test(src) && !/xmlns:gx\s*=/.test(src)) {
      src = src.replace(/<((\w+:)?kml)\b/, '<$1 xmlns:gx="http://www.google.com/kml/ext/2.2"');
    }
    var doc = parseXml(src);
    var placemarks = descendants(doc.documentElement, 'Placemark');
    if (!placemarks.length) throw new Error(tr('kmlEmptyError'));
    var warnings = [];
    var drafts = [];
    var tagNames = dict();
    var usedNames = dict();
    var tagColors = dict();
    var styleColors = kmlStyleColors(doc);
    placemarks.forEach(function (pm, idx) {
      var label = 'Placemark[' + idx + ']';
      var name = childText(pm, 'name');
      var geoms = kmlGeometries(pm, []);
      if (!geoms.length) {
        warnings.push(tr('warningKmlNoGeometry', { label: label, name: name }));
        return;
      }
      var props = kmlProperties(pm);
      var tag = props.tag != null && props.tag !== '' ? String(props.tag) : '';
      delete props.tag;
      var folder = kmlFolderName(pm);
      if (!tag) tag = folder || UNCATEGORIZED_ID;
      // 1つのFolder名を別々のタグの表示名に使い回さない（編集で別Folderへ移したPlacemarkなど）
      if (folder && tag !== UNCATEGORIZED_ID && !tagNames[tag] && !usedNames[folder]) {
        tagNames[tag] = folder;
        usedNames[folder] = true;
      }
      if (tag !== UNCATEGORIZED_ID && !tagColors[tag]) tagColors[tag] = placemarkColor(pm, styleColors);
      var note = descriptionToText(childText(pm, 'description'));
      var pid = xmlAttr(pm, 'id');
      geoms.forEach(function (g, gi) {
        if (g.unsupported) {
          warnings.push(tr('warningUnsupportedGeometry', { label: label, geomType: g.unsupported }));
          return;
        }
        var f = { id: gi === 0 && pid ? pid : undefined, type: g.type, tag: tag, name: name, coordinates: g.coordinates, properties: Object.assign({}, props) };
        if (note) f.note = note;
        drafts.push({ label: label, f: f });
      });
    });
    var title = childText(childElements(doc.documentElement, 'Document')[0] || doc.documentElement, 'name');
    return finishXmlImport(drafts, warnings, tagNames, title, tagColors);
  }

  /* GPXテキスト → 内部構造。wpt は点、rte と trk の各 trkseg は線として取り込む。 */
  function parseGPX(text) {
    var doc = parseXml(text);
    var root = doc.documentElement;
    if (localName(root) !== 'gpx') throw new Error(tr('gpxEmptyError'));
    var drafts = [];
    var toPoint = function (el) { return latLngOf(xmlAttr(el, 'lat'), xmlAttr(el, 'lon')); };

    childElements(root, 'wpt').forEach(function (w, i) {
      var props = {};
      var ele = global.Util.toNumber(childText(w, 'ele'));
      if (!isNaN(ele)) props[tr('elevationPropKey')] = ele;
      ['time', 'type', 'sym'].forEach(function (k) {
        var v = childText(w, k);
        if (v) props[k] = v;
      });
      var f = { type: 'point', tag: 'waypoint', name: childText(w, 'name'), coordinates: toPoint(w), properties: props };
      var note = childText(w, 'desc') || childText(w, 'cmt');
      if (note) f.note = note;
      drafts.push({ label: 'wpt[' + i + ']', f: f });
    });
    var withNote = function (f, el) {
      var note = childText(el, 'desc') || childText(el, 'cmt');
      if (note) f.note = note;
      return f;
    };
    childElements(root, 'rte').forEach(function (r, i) {
      drafts.push({
        label: 'rte[' + i + ']',
        f: withNote({ type: 'line', tag: 'route', name: childText(r, 'name'), coordinates: childElements(r, 'rtept').map(toPoint), properties: {} }, r)
      });
    });
    childElements(root, 'trk').forEach(function (t, i) {
      var name = childText(t, 'name');
      var segs = childElements(t, 'trkseg');
      segs.forEach(function (s, si) {
        drafts.push({
          label: 'trk[' + i + ']' + (segs.length > 1 ? '.trkseg[' + si + ']' : ''),
          f: withNote({
            type: 'line', tag: 'track',
            name: segs.length > 1 && name ? name + ' (' + (si + 1) + ')' : name,
            coordinates: childElements(s, 'trkpt').map(toPoint),
            properties: {}
          }, t)
        });
      });
    });
    if (!drafts.length) throw new Error(tr('gpxEmptyError'));
    var tagNames = dict();
    tagNames.waypoint = tr('gpxWaypoints');
    tagNames.route = tr('gpxRoutes');
    tagNames.track = tr('gpxTracks');
    var metadata = childElements(root, 'metadata')[0];
    // GPX 1.1 は metadata/name、GPX 1.0 はルート直下の name に表題を持つ
    return finishXmlImport(drafts, [], tagNames, (metadata && childText(metadata, 'name')) || childText(root, 'name'));
  }

  /* KML/GPX 共通の仕上げ：ID採番・重複解消・検証・タグ生成 */
  function finishXmlImport(drafts, warnings, tagNames, title, tagColors) {
    var ids = createIdAllocator(drafts.map(function (d) { return d.f.id; }));
    var features = [];
    drafts.forEach(function (d) {
      var f = d.f;
      var dup = ids.ensure(f);
      if (dup != null) warnings.push(tr('warningItemDuplicateId', { label: d.label, id: dup, newId: f.id }));
      var v = validateFeature(f);
      if (!v.ok) {
        warnings.push(tr('warningItemInvalid', { label: d.label, id: f.id, errors: v.errors.join(' / ') }));
        return;
      }
      ids.commit(f.id);
      features.push(f);
    });
    return {
      meta: title ? { title: title } : {},
      view: null,
      tags: tagsFromFeatures(features, tagNames).map(function (t) {
        var c = tagColors && tagColors[t.id];
        return c ? Object.assign({}, t, { color: c }) : t;
      }),
      features: features,
      warnings: warnings
    };
  }

  /* features に現れたタグIDからタグ定義を自動生成。names（タグID→表示名）があれば名称に使う。 */
  function tagsFromFeatures(features, names) {
    var tags = [];
    var seen = dict();
    features.forEach(function (f) {
      if (seen[f.tag]) return;
      seen[f.tag] = true;
      if (f.tag === UNCATEGORIZED_ID) tags.push(uncategorizedTag());
      else tags.push({ id: f.tag, name: (names && names[f.tag]) || f.tag, color: TAG_PALETTE[tags.length % TAG_PALETTE.length] });
    });
    return tags;
  }

  /* IDの採番と重複解消。reserved は入力中に現れる全ID（自動採番がそれらと衝突しないよう予約する）。 */
  function createIdAllocator(reserved) {
    var used = dict();
    var assigned = dict();
    var next = dict(); // プレフィクスごとの次の候補番号（毎回1から探し直さない）
    (reserved || []).forEach(function (id) {
      if (id != null && id !== '') used[String(id)] = true;
    });
    function allocate(type) {
      var p = idPrefix(type);
      var n = next[p] || 1;
      while (used[formatId(p, n)]) n++;
      next[p] = n + 1;
      used[formatId(p, n)] = true;
      return formatId(p, n);
    }
    return {
      /* 未使用のIDを新しく採番する */
      allocate: allocate,
      /* f.id が未設定、または採用済みIDと重複していれば採番し直す。重複していた場合は元のIDを返す。 */
      ensure: function (f) {
        var dup = null;
        if (f.id == null || f.id === '') {
          f.id = allocate(f.type);
        } else if (assigned[f.id]) {
          dup = f.id;
          f.id = allocate(f.type);
        }
        used[f.id] = true;
        return dup;
      },
      commit: function (id) { assigned[id] = true; },
      isAssigned: function (id) { return !!assigned[id]; }
    };
  }

  function idPrefix(type) { return type === 'point' ? 'p' : type === 'line' ? 'l' : 'g'; }
  function formatId(prefix, n) { return prefix + (n < 100 ? ('00' + n).slice(-3) : String(n)); }

  /* type別プレフィクス(p/l/g)＋連番で、usedIds（オブジェクトまたはMap）と衝突しないIDを返す */
  function nextFreeId(type, usedIds) {
    var p = idPrefix(type);
    var has = (usedIds instanceof Map)
      ? function (id) { return usedIds.has(id); }
      : function (id) { return !!usedIds && Object.prototype.hasOwnProperty.call(usedIds, id) && !!usedIds[id]; };
    var n = 1;
    while (has(formatId(p, n))) n++;
    return formatId(p, n);
  }

  /* 既存データへ取込データを追加する。current/incoming とも {tags:[], features:[]}。
   * タグは既存の定義を優先し、IDが衝突するフィーチャは採番し直す。入力は変更しない。 */
  function mergeData(current, incoming) {
    var warnings = (incoming.warnings || []).slice();
    var tags = current.tags.slice();
    var tagIds = dict();
    tags.forEach(function (t) { tagIds[t.id] = true; });
    incoming.tags.forEach(function (t) {
      if (!tagIds[t.id]) { tagIds[t.id] = true; tags.push(t); }
    });

    // 既存・取込の両方のIDを予約し、衝突した取込フィーチャだけを採番し直す
    var ids = createIdAllocator(current.features.concat(incoming.features).map(function (f) { return f.id; }));
    current.features.forEach(function (f) { ids.commit(f.id); });
    var features = current.features.slice();
    incoming.features.forEach(function (f) {
      if (ids.isAssigned(f.id)) {
        var newId = ids.allocate(f.type);
        warnings.push(tr('warningMergeDuplicateId', { id: f.id, newId: newId }));
        f = Object.assign({}, f, { id: newId });
      }
      ids.commit(f.id);
      features.push(f);
    });
    return { tags: tags, features: features, warnings: warnings };
  }

  /* ファイル名（拡張子）と内容から形式を判定する: 'yaml' | 'geojson' | 'csv' | 'kml' | 'gpx' */
  function detectFormat(filename, text) {
    var m = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'csv' || ext === 'tsv') return 'csv';
    if (ext === 'geojson' || ext === 'json') return 'geojson';
    if (ext === 'yaml' || ext === 'yml') return 'yaml';
    if (ext === 'kml') return 'kml';
    if (ext === 'gpx') return 'gpx';
    if (ext === 'kmz') return 'kmz';
    // 拡張子で分からないもの（Excelの「Unicodeテキスト」= .txt など）は内容で判定する
    var src = String(text || '').replace(/^﻿/, '');
    if (/^\s*[{[]/.test(src)) return 'geojson';
    if (/^\s*</.test(src)) return /<(\w+:)?gpx[\s>/]/.test(src) ? 'gpx' : 'kml';
    return looksLikeCsvHeader(src) ? 'csv' : 'yaml';
  }

  /* 最初の空でない行が、緯度・経度の見出しを含む区切りテキストか */
  function looksLikeCsvHeader(text) {
    var line = String(text).replace(/^\ufeff/, '').split(/\r\n|\r|\n/).filter(function (l) { return l.trim() !== ''; })[0] || '';
    var cells = line.split(/[,\t;]/).map(function (c) { return c.trim().replace(/^"|"$/g, '').toLowerCase(); });
    var hasAlias = function (field) {
      return cells.some(function (c) { return CSV_ALIASES[field].indexOf(c) !== -1; });
    };
    return cells.length >= 2 && hasAlias('lat') && hasAlias('lng');
  }

  /* 形式名に応じたパーサで読み込む。未知の形式はYAMLとして扱う。 */
  function parseText(format, text) {
    if (format === 'geojson') return parseGeoJSON(text);
    if (format === 'csv') return parseCSV(text);
    if (format === 'kml') return parseKML(text);
    if (format === 'gpx') return parseGPX(text);
    if (format === 'kmz') throw new Error(tr('kmzUnsupportedError'));
    return parseYaml(text);
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
    return global.jsyaml.dump(out, yamlOptions({ lineWidth: 120, noRefs: true }));
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
    var base = { id: feature.id, name: feature.name, tag: feature.tag, _type: feature.type };
    return {
      type: 'Feature',
      id: feature.id,
      // 基本キーは表示項目に同名のキーがあっても上書きさせない（読込側は基本キーを表示項目から除外する）
      properties: Object.assign({}, base, feature.properties || {}, base),
      geometry: geom
    };
  }

  function swap(p) { return [p[1], p[0]]; }

  /* GeoJSON Feature → 内部フィーチャ（[経度,緯度]→[緯度,経度]） */
  function fromGeoJSON(gj) {
    var g = gj.geometry || {};
    var rawId = gj.id != null ? gj.id : (gj.properties && gj.properties.id);
    var f = {
      // 数値ID/タグはMapキーや検索で文字列として扱うため正規化する
      id: rawId != null ? String(rawId) : undefined,
      name: (gj.properties && gj.properties.name != null) ? String(gj.properties.name) : '',
      properties: {}
    };
    if (gj.properties) {
      Object.keys(gj.properties).forEach(function (k) {
        if (['id', 'name', 'tag', '_type'].indexOf(k) === -1) f.properties[k] = gj.properties[k];
      });
      f.tag = gj.properties.tag != null && gj.properties.tag !== '' ? String(gj.properties.tag) : UNCATEGORIZED_ID;
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
    UNCATEGORIZED_ID: UNCATEGORIZED_ID,
    uncategorizedTag: uncategorizedTag,
    isSafeColor: isSafeColor,
    validateFeature: validateFeature,
    parseYaml: parseYaml,
    parseGeoJSON: parseGeoJSON,
    parseCSV: parseCSV,
    parseKML: parseKML,
    parseGPX: parseGPX,
    parseText: parseText,
    detectFormat: detectFormat,
    mergeData: mergeData,
    nextFreeId: nextFreeId,
    dumpYaml: dumpYaml,
    toGeoJSON: toGeoJSON,
    fromGeoJSON: fromGeoJSON,
    mapToArray: mapToArray
  };
})(typeof window !== 'undefined' ? window : this);
