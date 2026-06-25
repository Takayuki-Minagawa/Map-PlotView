/* ui.js — サイドバー描画 / タグ管理 / 一覧 / 抽出結果 / 編集モーダル / エクスポート整形 */
(function (global) {
  'use strict';

  var esc = function (s) { return global.Symbols.escapeHtml(s); };
  var tr = function (key, vars) { return global.I18n ? global.I18n.t(key, vars) : key; };
  var typeLabel = function (type) { return global.I18n ? global.I18n.typeLabel(type) : type; };

  function UI(refs, handlers) {
    this.refs = refs;          // {tagList, featureList, selectionList, selectionCount, warnings}
    this.h = handlers || {};   // コールバック群
  }

  /* タグ一覧（凡例＋表示ON/OFF＋編集/削除） */
  UI.prototype.renderTagList = function (tags, hiddenTags) {
    var self = this;
    var el = this.refs.tagList;
    el.innerHTML = '';
    tags.forEach(function (t) {
      var hidden = hiddenTags && hiddenTags.has(t.id);
      var row = document.createElement('div');
      row.className = 'mpv-tag' + (hidden ? ' is-hidden' : '');
      row.innerHTML =
        '<label class="mpv-tag__main">' +
        '<input type="checkbox" ' + (hidden ? '' : 'checked') + '>' +
        '<span class="mpv-tag__swatch" style="background:' + esc(t.color || '#999') + '"></span>' +
        '<span class="mpv-tag__glyph">' + esc(global.Symbols.glyphFor(t.symbol)) + '</span>' +
        '<span class="mpv-tag__name">' + esc(t.name || t.id) + '</span>' +
        '</label>' +
        '<span class="mpv-tag__btns">' +
        '<button data-act="edit" title="' + esc(tr('edit')) + '">✎</button>' +
        '<button data-act="del" title="' + esc(tr('delete')) + '">x</button></span>';
      row.querySelector('input').addEventListener('change', function (e) {
        if (self.h.onToggleTag) self.h.onToggleTag(t.id, e.target.checked);
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', function () {
        if (self.h.onEditTag) self.h.onEditTag(t);
      });
      row.querySelector('[data-act="del"]').addEventListener('click', function () {
        if (self.h.onDeleteTag) self.h.onDeleteTag(t.id);
      });
      el.appendChild(row);
    });
  };

  /* 全プロット一覧 */
  UI.prototype.renderFeatureList = function (features, tagsById, activeId) {
    this._renderRows(this.refs.featureList, features, tagsById, activeId);
  };

  /* 抽出結果リスト */
  UI.prototype.renderSelectionList = function (features, tagsById, activeId) {
    if (this.refs.selectionCount) {
      this.refs.selectionCount.textContent = features.length ? tr('selectedCount', { count: features.length }) : '';
    }
    this._renderRows(this.refs.selectionList, features, tagsById, activeId,
      '<div class="mpv-empty">' + esc(tr('selectionEmpty')) + '</div>');
  };

  UI.prototype._renderRows = function (el, features, tagsById, activeId, emptyHtml) {
    var self = this;
    el.innerHTML = '';
    if (!features.length) {
      el.innerHTML = emptyHtml || '<div class="mpv-empty">' + esc(tr('noData')) + '</div>';
      return;
    }
    features.forEach(function (f) {
      var tag = tagsById[f.tag];
      var color = (tag && tag.color) || '#999';
      var glyph = global.Symbols.glyphFor(f.symbol || (tag && tag.symbol));
      var row = document.createElement('div');
      row.className = 'mpv-row' + (f.id === activeId ? ' is-active' : '');
      row.innerHTML =
        '<span class="mpv-row__glyph" style="background:' + esc(color) + '">' + esc(glyph) + '</span>' +
        '<span class="mpv-row__name">' + esc(f.name || f.id) + '</span>' +
        '<span class="mpv-row__meta">' + esc(tag ? (tag.name || tag.id) : tr('uncategorized')) + ' · ' + esc(typeLabel(f.type)) + '</span>';
      row.addEventListener('click', function () {
        if (self.h.onSelectFeature) self.h.onSelectFeature(f.id);
      });
      el.appendChild(row);
    });
  };

  UI.prototype.showWarnings = function (warnings) {
    var el = this.refs.warnings;
    if (!el) return;
    if (!warnings || !warnings.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = '';
    el.innerHTML = '<b>' + esc(tr('warningsTitle', { count: warnings.length })) + '</b><ul>' +
      warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
  };

  /* タグ編集モーダル */
  UI.prototype.openTagEditor = function (tag, onSave) {
    var isNew = !tag;
    tag = tag || { id: '', name: '', color: '#2e7d32', symbol: 'pin', description: '' };
    var body =
      field('id', tr('fieldId'), '<input name="id" value="' + esc(tag.id) + '" ' + (isNew ? '' : 'readonly') + '>') +
      field('name', tr('fieldName'), '<input name="name" value="' + esc(tag.name || '') + '">') +
      field('color', tr('fieldColor'), '<input name="color" type="color" value="' + esc(tag.color || '#2e7d32') + '">') +
      field('symbol', tr('fieldSymbol'), symbolSelect(tag.symbol)) +
      field('description', tr('fieldDescription'), '<textarea name="description">' + esc(tag.description || '') + '</textarea>');
    modal(isNew ? tr('addTagTitle') : tr('editTagTitle'), body, function (form) {
      var t = {
        id: form.id.value.trim(),
        name: form.name.value.trim(),
        color: form.color.value,
        symbol: form.symbol.value,
        description: form.description.value
      };
      if (!t.id) { alert(tr('idRequired')); return false; }
      onSave(t, isNew);
      return true;
    });
  };

  /* フィーチャ編集モーダル（プロパティ/メモ/写真） */
  UI.prototype.openFeatureEditor = function (feature, tags, ctx, onSave, onCancel) {
    var isNew = !feature.id;
    var photos = (feature.photos || []).slice();
    var tagOpts = tags.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === feature.tag ? ' selected' : '') + '>' + esc(t.name || t.id) + '</option>';
    }).join('');
    var propsText = Object.keys(feature.properties || {}).map(function (k) {
      return k + ': ' + formatVal(feature.properties[k]);
    }).join('\n');

    var body =
      field('id', tr('fieldId'), '<input name="id" value="' + esc(feature.id || '') + '" ' + (isNew ? '' : 'readonly') + '>') +
      field('name', tr('fieldName'), '<input name="name" value="' + esc(feature.name || '') + '">') +
      field('tag', tr('fieldTag'), '<select name="tag">' + tagOpts + '</select>') +
      field('symbol', tr('fieldSymbolOverride'), symbolSelect(feature.symbol, true)) +
      '<div class="mpv-field"><label>' + esc(tr('fieldTypeCoords')) + '</label><div class="mpv-readonly">' +
        esc(typeLabel(feature.type)) + ' : ' + esc(coordPreview(feature)) + '</div></div>' +
      field('props', tr('fieldProps'), '<textarea name="props" rows="4">' + esc(propsText) + '</textarea>') +
      field('note', tr('fieldNote'), '<textarea name="note" rows="3">' + esc(feature.note || '') + '</textarea>') +
      '<div class="mpv-field"><label>' + esc(tr('fieldPhotos')) + '</label>' +
        '<div class="mpv-photo-edit" id="mpvPhotoEdit"></div>' +
        '<input type="file" id="mpvPhotoFile" accept="image/*" multiple>' +
        '<label class="mpv-embed"><input type="checkbox" id="mpvEmbed"> ' + esc(tr('embedDataUrl')) + '</label>' +
      '</div>';

    var self = this;
    modal(isNew ? tr('addPlotTitle') : tr('editPlotTitle'), body, function (form) {
      var f = Object.assign({}, feature);
      f.id = form.id.value.trim();
      f.name = form.name.value.trim();
      f.tag = form.tag.value;
      f.symbol = form.symbol.value || undefined;
      f.note = form.note.value || undefined;
      f.properties = parseProps(form.props.value);
      f.photos = photos.length ? photos : undefined;
      if (!f.id) { alert(tr('idRequired')); return false; }
      onSave(f, isNew);
      return true;
    }, function (modalEl) {
      // 写真編集UIの結線
      var listEl = modalEl.querySelector('#mpvPhotoEdit');
      function redraw() {
        listEl.innerHTML = photos.map(function (p, i) {
          return '<div class="mpv-photo-item"><img src="' + esc(global.Detail.resolveSrc(p.src, ctx.meta)) + '">' +
            '<input data-i="' + i + '" data-k="caption" placeholder="' + esc(tr('placeholderCaption')) + '" value="' + esc(p.caption || '') + '">' +
            '<button data-del="' + i + '">x</button></div>';
        }).join('');
        listEl.querySelectorAll('input[data-k]').forEach(function (inp) {
          inp.addEventListener('input', function () { photos[+inp.getAttribute('data-i')].caption = inp.value; });
        });
        listEl.querySelectorAll('button[data-del]').forEach(function (b) {
          b.addEventListener('click', function () { photos.splice(+b.getAttribute('data-del'), 1); redraw(); });
        });
      }
      redraw();
      modalEl.querySelector('#mpvPhotoFile').addEventListener('change', function (e) {
        var embed = modalEl.querySelector('#mpvEmbed').checked;
        var files = Array.prototype.slice.call(e.target.files);
        files.forEach(function (file) {
          global.Detail.extractExif(file).then(function (meta) {
            var photo = { caption: file.name, takenAt: meta.takenAt, location: meta.location };
            if (embed) {
              var reader = new FileReader();
              reader.onload = function () { photo.src = reader.result; photos.push(photo); redraw(); };
              reader.readAsDataURL(file);
            } else {
              // photoBase設定時はそれを基準にした相対ファイル名、未設定時は photos/ を前置
              photo.src = (ctx.meta && ctx.meta.photoBase ? '' : 'photos/') + file.name;
              photos.push(photo);
              redraw();
            }
          });
        });
        e.target.value = '';
      });
    }, onCancel);
  };

  /* ---- エクスポート整形 ---- */
  function toCSV(features, tagsById) {
    var rows = [['id', 'name', 'tag', 'type', 'lat', 'lng', 'note']];
    features.forEach(function (f) {
      var lat = '', lng = '';
      if (f.type === 'point') { lat = f.coordinates[0]; lng = f.coordinates[1]; }
      else if (f.coordinates && f.coordinates.length) {
        var first = f.type === 'line' ? f.coordinates[0] : f.coordinates[0][0];
        lat = first[0]; lng = first[1];
      }
      rows.push([f.id, f.name || '', f.tag || '', f.type, lat, lng, (f.note || '').replace(/\n/g, ' ')]);
    });
    return rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
  }

  function toGeoJSONCollection(features) {
    return {
      type: 'FeatureCollection',
      features: features.map(function (f) { return global.Store.toGeoJSON(f); })
    };
  }

  /* ---- 小物 ---- */
  function field(name, label, control) {
    return '<div class="mpv-field"><label>' + esc(label) + '</label>' + control + '</div>';
  }

  function symbolSelect(current, allowEmpty) {
    var opts = allowEmpty ? '<option value="">' + esc(tr('symbolDefault')) + '</option>' : '';
    Object.keys(global.Symbols.GLYPHS).forEach(function (k) {
      opts += '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' +
        global.Symbols.GLYPHS[k] + ' ' + k + '</option>';
    });
    return '<select name="symbol">' + opts + '</select>';
  }

  function parseProps(text) {
    var o = {};
    (text || '').split('\n').forEach(function (line) {
      var i = line.indexOf(':');
      if (i === -1) return;
      var k = line.slice(0, i).trim();
      var v = line.slice(i + 1).trim();
      if (!k) return;
      if (/^-?\d+(\.\d+)?$/.test(v)) v = parseFloat(v);
      o[k] = v;
    });
    return o;
  }

  function coordPreview(f) {
    if (f.type === 'point') return f.coordinates.join(', ');
    if (!f.coordinates || !f.coordinates.length) return tr('coordinateUnset');
    var n = f.type === 'line' ? f.coordinates.length : f.coordinates[0].length;
    return tr('pointsCount', { count: n });
  }

  function formatVal(v) {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* 汎用モーダル。onSubmitがfalseを返すと閉じない。afterRenderで内部結線。 */
  function modal(title, bodyHtml, onSubmit, afterRender, onCancel) {
    var back = document.createElement('div');
    back.className = 'mpv-modal';
    back.innerHTML =
      '<form class="mpv-modal__box">' +
      '<header><h3>' + esc(title) + '</h3><button type="button" class="mpv-modal__x" aria-label="' + esc(tr('close')) + '">x</button></header>' +
      '<div class="mpv-modal__body">' + bodyHtml + '</div>' +
      '<footer><button type="button" class="mpv-cancel">' + esc(tr('cancel')) + '</button>' +
      '<button type="submit" class="mpv-ok">' + esc(tr('save')) + '</button></footer></form>';
    var submitted = false;
    function close() {
      if (back.parentNode) back.parentNode.removeChild(back);
      if (!submitted && onCancel) onCancel();
    }
    back.querySelector('.mpv-modal__x').addEventListener('click', close);
    back.querySelector('.mpv-cancel').addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    var form = back.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = onSubmit(form);
      if (r !== false) { submitted = true; close(); }
    });
    document.body.appendChild(back);
    if (afterRender) afterRender(back);
    var firstInput = form.querySelector('input,select,textarea');
    if (firstInput) firstInput.focus();
  }

  UI.toCSV = toCSV;
  UI.toGeoJSONCollection = toGeoJSONCollection;
  global.UI = UI;
})(typeof window !== 'undefined' ? window : this);
