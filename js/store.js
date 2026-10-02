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

  /* CSSへ埋め込んでよい色表記か（#hex / 色名 / rgb()・hsl()）。外部ファイル由来の値をstyle属性へ入れる前に確認する。 */
  function isSafeColor(c) {
    return typeof c === 'string' &&
      /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([0-9.,%\s/]+\))$/i.test(c.trim());
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
    var sep = /^sep=(.)\r?\n/i.exec(src);
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
      else if (ch !== ' ') seen = true;
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

  /* features に現れたタグIDからタグ定義を自動生成 */
  function tagsFromFeatures(features) {
    var tags = [];
    var seen = dict();
    features.forEach(function (f) {
      if (seen[f.tag]) return;
      seen[f.tag] = true;
      if (f.tag === UNCATEGORIZED_ID) tags.push(uncategorizedTag());
      else tags.push({ id: f.tag, name: f.tag, color: TAG_PALETTE[tags.length % TAG_PALETTE.length] });
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

  /* ファイル名（拡張子）と内容から形式を判定する: 'yaml' | 'geojson' | 'csv' */
  function detectFormat(filename, text) {
    var m = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'csv' || ext === 'tsv') return 'csv';
    if (ext === 'geojson' || ext === 'json') return 'geojson';
    if (ext === 'yaml' || ext === 'yml') return 'yaml';
    return /^\s*[{[]/.test(String(text || '')) ? 'geojson' : 'yaml';
  }

  /* 形式名に応じたパーサで読み込む。未知の形式はYAMLとして扱う。 */
  function parseText(format, text) {
    if (format === 'geojson') return parseGeoJSON(text);
    if (format === 'csv') return parseCSV(text);
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
