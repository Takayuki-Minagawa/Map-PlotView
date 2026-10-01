/* detail.js — 詳細ビューア / 写真ギャラリ / ライトボックス / EXIF抽出 */
(function (global) {
  'use strict';

  var esc = function (s) { return global.Util.escapeHtml(s); };
  var tr = function (key, vars) { return global.I18n ? global.I18n.t(key, vars) : key; };
  var typeLabel = function (type) { return global.I18n ? global.I18n.typeLabel(type) : type; };

  function Detail(panelEl, opts) {
    this.el = panelEl;
    this.opts = opts || {};
    this.current = null;
  }

  Detail.prototype.clearDetail = function () {
    this.current = null;
    this.el.innerHTML = '<div class="mpv-detail__empty">' + esc(tr('detailEmpty')) + '</div>';
    this.el.classList.remove('is-open');
  };

  Detail.prototype.showDetail = function (feature, tag, meta) {
    this.current = feature;
    this.el.classList.add('is-open');
    var m = global.Select ? global.Select.measure(feature) : {};
    var html = [];

    html.push('<div class="mpv-detail__head">');
    var glyph = global.Symbols.glyphFor(feature.symbol || (tag && tag.symbol));
    var color = (tag && tag.color) || '#666';
    html.push('<span class="mpv-detail__glyph" style="background:' + esc(color) + '">' + esc(glyph) + '</span>');
    html.push('<div><h2>' + esc(feature.name || feature.id || tr('unnamed')) + '</h2>');
    html.push('<div class="mpv-detail__sub"><span class="mpv-chip" style="--mpv-color:' + esc(color) + '">' +
      esc(tag ? (tag.name || tag.id) : tr('uncategorized')) + '</span> <span class="mpv-type">' + esc(typeLabel(feature.type)) + '</span></div></div>');
    html.push('</div>');

    // 座標 / 計測
    html.push('<section class="mpv-detail__sec"><h3>' + esc(tr('coordinates')) + '</h3>');
    html.push('<div class="mpv-coords">' + coordSummary(feature, m) + '</div>');
    if (feature.type === 'point' && global.Geo) {
      html.push('<div class="mpv-elev"><button type="button" class="mpv-mini" data-elev="get">' + esc(tr('elevationGet')) +
        '</button> <span class="mpv-elev__result" aria-live="polite"></span></div>');
    }
    html.push('</section>');

    // properties
    var props = feature.properties || {};
    var keys = Object.keys(props);
    if (keys.length) {
      html.push('<section class="mpv-detail__sec"><h3>' + esc(tr('properties')) + '</h3><table class="mpv-props">');
      keys.forEach(function (k) {
        html.push('<tr><th>' + esc(k) + '</th><td>' + esc(formatVal(props[k])) + '</td></tr>');
      });
      html.push('</table></section>');
    }

    // note
    if (feature.note) {
      html.push('<section class="mpv-detail__sec"><h3>' + esc(tr('note')) + '</h3><div class="mpv-note">' +
        esc(feature.note).replace(/\n/g, '<br>') + '</div></section>');
    }

    // 写真
    var photos = feature.photos || [];
    if (photos.length) {
      html.push('<section class="mpv-detail__sec"><h3>' + esc(tr('photos')) + '</h3><div class="mpv-gallery">');
      photos.forEach(function (p, i) {
        var src = resolveSrc(p.src, meta);
        html.push('<figure class="mpv-thumb" data-photo-index="' + i + '">' +
          '<img loading="lazy" src="' + esc(src) + '" alt="' + esc(p.caption || '') + '">' +
          (p.caption ? '<figcaption>' + esc(p.caption) + '</figcaption>' : '') + '</figure>');
      });
      html.push('</div></section>');
    }

    // アクション
    html.push('<div class="mpv-detail__actions">' +
      '<button data-action="focus">' + esc(tr('focusOnMap')) + '</button>' +
      '<button data-action="reshape">' + esc(tr('reshape')) + '</button>' +
      '<button data-action="edit">' + esc(tr('edit')) + '</button>' +
      '<button data-action="delete" class="danger">' + esc(tr('delete')) + '</button></div>');

    this.el.innerHTML = html.join('');

    // イベント結線
    var self = this;
    this.el.querySelectorAll('.mpv-thumb').forEach(function (fig) {
      fig.addEventListener('click', function () {
        var idx = parseInt(fig.getAttribute('data-photo-index'), 10);
        self.openLightbox(photos[idx], meta);
      });
    });
    this.el.querySelectorAll('.mpv-detail__actions button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = btn.getAttribute('data-action');
        if (self.opts['on' + cap(a)]) self.opts['on' + cap(a)](feature);
      });
    });
    var elevBtn = this.el.querySelector('[data-elev="get"]');
    if (elevBtn) elevBtn.addEventListener('click', function () { self._fetchElevation(feature, elevBtn); });
  };

  /* 点の標高を取得して表示し、表示項目へ保存するボタンを出す */
  Detail.prototype._fetchElevation = function (feature, btn) {
    var self = this;
    var out = this.el.querySelector('.mpv-elev__result');
    if (!out) return;
    btn.disabled = true;
    out.textContent = tr('elevationLoading');
    global.Geo.getElevation(feature.coordinates[0], feature.coordinates[1]).then(function (res) {
      if (self.current !== feature || !out.isConnected) return; // 取得中に別の項目へ切り替わった
      btn.disabled = false;
      if (!res) { out.textContent = tr('elevationNoData'); return; }
      out.textContent = tr('elevationValue', { value: res.elevation, source: res.source }) + ' ';
      var save = document.createElement('button');
      save.type = 'button';
      save.className = 'mpv-mini';
      save.textContent = tr('elevationSave');
      save.addEventListener('click', function () {
        if (self.opts.onSaveProperty) self.opts.onSaveProperty(feature, tr('elevationPropKey'), res.elevation);
      });
      out.appendChild(save);
    }).catch(function (e) {
      if (self.current !== feature || !out.isConnected) return;
      btn.disabled = false;
      out.textContent = tr('elevationError', { message: e.message });
    });
  };

  Detail.prototype.openLightbox = function (photo, meta) {
    var src = resolveSrc(photo.src, meta);
    var box = document.createElement('div');
    box.className = 'mpv-lightbox';
    var info = [];
    if (photo.caption) info.push(esc(photo.caption));
    if (photo.takenAt) info.push(esc(tr('takenAt')) + ': ' + esc(formatVal(photo.takenAt)));
    if (Array.isArray(photo.location)) info.push(esc(tr('location')) + ': ' + esc(photo.location.join(', ')));
    box.innerHTML =
      '<div class="mpv-lightbox__inner">' +
      '<button class="mpv-lightbox__close" aria-label="' + esc(tr('close')) + '">x</button>' +
      '<img src="' + esc(src) + '" alt="">' +
      (info.length ? '<div class="mpv-lightbox__cap">' + info.join(' ／ ') + '</div>' : '') +
      '</div>';
    function close() { if (box.parentNode) box.parentNode.removeChild(box); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    box.querySelector('.mpv-lightbox__close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
  };

  /* exifrでEXIF（撮影日時・GPS）抽出。{takenAt, location} を返す。 */
  function extractExif(file) {
    if (!global.exifr) return Promise.resolve({});
    return global.exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] })
      .then(function (data) {
        if (!data) return {};
        var out = {};
        var dt = data.DateTimeOriginal || data.CreateDate;
        if (dt) out.takenAt = (dt instanceof Date) ? dt.toISOString() : String(dt);
        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          out.location = [round(data.latitude), round(data.longitude)];
        }
        return out;
      })
      .catch(function () { return {}; });
  }

  function coordSummary(feature, m) {
    if (feature.type === 'point') {
      var c = feature.coordinates;
      return esc(tr('latitude')) + ' ' + c[0] + ' / ' + esc(tr('longitude')) + ' ' + c[1];
    }
    if (feature.type === 'line') {
      var n = feature.coordinates.length;
      var s = esc(tr('vertexCount', { count: n }));
      if (typeof m.length === 'number') s += ' / ' + esc(tr('approxLength', { value: m.length.toFixed(3) }));
      s += '<br>' + esc(tr('representativePoint')) + ': ' + feature.coordinates[0].join(', ');
      return s;
    }
    if (feature.type === 'polygon') {
      var verts = feature.coordinates.reduce(function (a, r) { return a + r.length; }, 0);
      var s2 = esc(tr('ringVertexCount', { rings: feature.coordinates.length, verts: verts }));
      if (typeof m.area === 'number') s2 += '<br>' + esc(tr('approxArea', { value: formatArea(m.area) }));
      return s2;
    }
    return '';
  }

  function formatArea(a) {
    if (a >= 1e6) return (a / 1e6).toFixed(3) + ' km²';
    return Math.round(a) + ' m²';
  }

  function resolveSrc(src, meta) {
    if (!src) return '';
    if (/^(data:|https?:|blob:|\/)/.test(src)) return src;
    var base = (meta && meta.photoBase) ? meta.photoBase : '';
    if (base && !/\/$/.test(base)) base += '/';
    return base + src;
  }

  var formatVal = function (v) { return global.Util.formatVal(v); };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function round(n) { return global.Util.round(n, 7); }  // EXIF GPSは7桁精度

  global.Detail = Detail;
  global.Detail.extractExif = extractExif;
  global.Detail.resolveSrc = resolveSrc;
})(typeof window !== 'undefined' ? window : this);
