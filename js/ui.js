/* ui.js — サイドバー描画 / タグ管理 / 一覧 / 抽出結果 / 編集モーダル / エクスポート整形 */
(function (global) {
  'use strict';

  var esc = function (s) { return global.Symbols.escapeHtml(s); };

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
        '<button data-act="edit" title="編集">✎</button>' +
        '<button data-act="del" title="削除">🗑</button></span>';
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
      this.refs.selectionCount.textContent = features.length ? ('（' + features.length + '件）') : '';
    }
    this._renderRows(this.refs.selectionList, features, tagsById, activeId,
      '<div class="mpv-empty">矩形選択でデータを抽出します。</div>');
  };

  UI.prototype._renderRows = function (el, features, tagsById, activeId, emptyHtml) {
    var self = this;
    el.innerHTML = '';
    if (!features.length) {
      el.innerHTML = emptyHtml || '<div class="mpv-empty">データがありません。</div>';
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
        '<span class="mpv-row__meta">' + esc(tag ? (tag.name || tag.id) : '未分類') + ' · ' + esc(f.type) + '</span>';
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
    el.innerHTML = '<b>⚠ 読込時の注意 (' + warnings.length + ')</b><ul>' +
      warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
  };

  /* タグ編集モーダル */
  UI.prototype.openTagEditor = function (tag, onSave) {
    var isNew = !tag;
    tag = tag || { id: '', name: '', color: '#2e7d32', symbol: 'pin', description: '' };
    var body =
      field('id', 'ID', '<input name="id" value="' + esc(tag.id) + '" ' + (isNew ? '' : 'readonly') + '>') +
      field('name', '名称', '<input name="name" value="' + esc(tag.name || '') + '">') +
      field('color', '色', '<input name="color" type="color" value="' + esc(tag.color || '#2e7d32') + '">') +
      field('symbol', '記号', symbolSelect(tag.symbol)) +
      field('description', '説明', '<textarea name="description">' + esc(tag.description || '') + '</textarea>');
    modal(isNew ? 'タグを追加' : 'タグを編集', body, function (form) {
      var t = {
        id: form.id.value.trim(),
        name: form.name.value.trim(),
        color: form.color.value,
        symbol: form.symbol.value,
        description: form.description.value
      };
      if (!t.id) { alert('IDは必須です'); return false; }
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
      field('id', 'ID', '<input name="id" value="' + esc(feature.id || '') + '" ' + (isNew ? '' : 'readonly') + '>') +
      field('name', '名称', '<input name="name" value="' + esc(feature.name || '') + '">') +
      field('tag', 'タグ', '<select name="tag">' + tagOpts + '</select>') +
      field('symbol', '記号(上書き任意)', symbolSelect(feature.symbol, true)) +
      '<div class="mpv-field"><label>種別/座標</label><div class="mpv-readonly">' +
        esc(feature.type) + ' : ' + esc(coordPreview(feature)) + '</div></div>' +
      field('props', '表示項目 (key: value 改行区切り)', '<textarea name="props" rows="4">' + esc(propsText) + '</textarea>') +
      field('note', 'メモ', '<textarea name="note" rows="3">' + esc(feature.note || '') + '</textarea>') +
      '<div class="mpv-field"><label>写真</label>' +
        '<div class="mpv-photo-edit" id="mpvPhotoEdit"></div>' +
        '<input type="file" id="mpvPhotoFile" accept="image/*" multiple>' +
        '<label class="mpv-embed"><input type="checkbox" id="mpvEmbed"> Data URLで埋め込み (方式C)</label>' +
      '</div>';

    var self = this;
    modal(isNew ? 'プロットを追加' : 'プロットを編集', body, function (form) {
      var f = Object.assign({}, feature);
      f.id = form.id.value.trim();
      f.name = form.name.value.trim();
      f.tag = form.tag.value;
      f.symbol = form.symbol.value || undefined;
      f.note = form.note.value || undefined;
      f.properties = parseProps(form.props.value);
      f.photos = photos.length ? photos : undefined;
      if (!f.id) { alert('IDは必須です'); return false; }
      onSave(f, isNew);
      return true;
    }, function (modalEl) {
      // 写真編集UIの結線
      var listEl = modalEl.querySelector('#mpvPhotoEdit');
      function redraw() {
        listEl.innerHTML = photos.map(function (p, i) {
          return '<div class="mpv-photo-item"><img src="' + esc(global.Detail.resolveSrc(p.src, ctx.meta)) + '">' +
            '<input data-i="' + i + '" data-k="caption" placeholder="キャプション" value="' + esc(p.caption || '') + '">' +
            '<button data-del="' + i + '">×</button></div>';
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
    var opts = allowEmpty ? '<option value="">(タグ既定)</option>' : '';
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
    if (!f.coordinates || !f.coordinates.length) return '(未設定)';
    var n = f.type === 'line' ? f.coordinates.length : f.coordinates[0].length;
    return n + '点';
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
      '<header><h3>' + esc(title) + '</h3><button type="button" class="mpv-modal__x">×</button></header>' +
      '<div class="mpv-modal__body">' + bodyHtml + '</div>' +
      '<footer><button type="button" class="mpv-cancel">キャンセル</button>' +
      '<button type="submit" class="mpv-ok">保存</button></footer></form>';
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
