/* util.js — モジュール横断の小物ヘルパ（最初に読み込むこと） */
(function (global) {
  'use strict';

  /* HTML特殊文字のエスケープ（属性値にも使用可） */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* 表示用の値整形（null/undefined→空、日付→ISO文字列、オブジェクト→JSON） */
  function formatVal(v) {
    if (v == null) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* 座標などの丸め。digits省略時は小数6桁（約0.1m精度） */
  function round(n, digits) {
    var f = Math.pow(10, digits == null ? 6 : digits);
    return Math.round(n * f) / f;
  }

  /* 10進数表記の文字列だけを数値にする（'1e3'や'0x10'、空文字はNaN） */
  function toNumber(s) {
    var v = String(s == null ? '' : s).trim();
    return /^[-+]?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : NaN;
  }

  /* テキスト入力値の型推定：数値に見えるものは数値、それ以外は前後空白を除いた文字列。
   * '007' のような先頭ゼロ付きはコード値とみなし文字列のまま保持する。 */
  function parseScalar(s) {
    var v = String(s == null ? '' : s).trim();
    if (/^[-+]?0\d/.test(v)) return v;
    var n = toNumber(v);
    return isNaN(n) ? v : n;
  }

  /* ファイル内容(ArrayBuffer)を文字列へ。UTF-8として不正ならShift_JIS（Excelの既定CSV）とみなす。 */
  function decodeText(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (e) {
      try {
        return new TextDecoder('shift_jis').decode(buffer);
      } catch (e2) {
        return new TextDecoder('utf-8').decode(buffer); // Shift_JIS非対応環境：置換文字入りでも読む
      }
    }
  }

  global.Util = {
    escapeHtml: escapeHtml,
    formatVal: formatVal,
    round: round,
    toNumber: toNumber,
    parseScalar: parseScalar,
    decodeText: decodeText
  };
})(typeof window !== 'undefined' ? window : this);
