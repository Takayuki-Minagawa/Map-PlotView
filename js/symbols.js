/* symbols.js — 記号(アイコン)定義。タグ色の円バッジ＋絵文字/記号でdivIconを生成。 */
(function (global) {
  'use strict';

  // 記号名 → 絵文字/文字。spec の symbol キーに対応。
  var GLYPHS = {
    building: '🏢',
    store: '🏬',
    star: '⭐',
    quake: '〰',
    fault: '⛰',
    pin: '📍',
    flag: '🚩',
    warning: '⚠',
    camera: '📷',
    dot: '●'
  };

  function glyphFor(symbol) {
    if (!symbol) return GLYPHS.pin;
    return GLYPHS[symbol] || symbol; // 未知ならそのまま（1文字記号等）
  }

  /* タグ色のバッジ＋記号で L.divIcon を返す（mapview から利用） */
  function divIcon(symbol, color) {
    var glyph = glyphFor(symbol);
    var c = color || '#2e7d32';
    var html =
      '<div class="mpv-marker" style="--mpv-color:' + escapeAttr(c) + '">' +
      '<span class="mpv-marker__glyph">' + escapeHtml(glyph) + '</span>' +
      '</div>';
    return global.L.divIcon({
      html: html,
      className: 'mpv-marker-wrap',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -26]
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  global.Symbols = {
    GLYPHS: GLYPHS,
    glyphFor: glyphFor,
    divIcon: divIcon,
    escapeHtml: escapeHtml
  };
})(typeof window !== 'undefined' ? window : this);
