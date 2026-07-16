/* util.js — モジュール横断の小物ヘルパ（最初に読み込むこと） */
(function (global) {
  'use strict';

  /* HTML特殊文字のエスケープ（属性値にも使用可） */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* 表示用の値整形（null/undefined→空、オブジェクト→JSON） */
  function formatVal(v) {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* 座標などの丸め。digits省略時は小数6桁（約0.1m精度） */
  function round(n, digits) {
    var f = Math.pow(10, digits == null ? 6 : digits);
    return Math.round(n * f) / f;
  }

  global.Util = {
    escapeHtml: escapeHtml,
    formatVal: formatVal,
    round: round
  };
})(typeof window !== 'undefined' ? window : this);
