'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox } = require('./helpers/load');

test('Util.escapeHtml: HTML特殊文字をエスケープする', () => {
  const { Util } = createSandbox({});
  assert.equal(Util.escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('Util.formatVal: null/オブジェクト/プリミティブの整形', () => {
  const { Util } = createSandbox({});
  assert.equal(Util.formatVal(null), '');
  assert.equal(Util.formatVal(undefined), '');
  assert.equal(Util.formatVal({ a: 1 }), '{"a":1}');
  assert.equal(Util.formatVal(42), '42');
  assert.equal(Util.formatVal('s'), 's');
});

test('Util.round: 既定6桁、指定桁数での丸め', () => {
  const { Util } = createSandbox({});
  assert.equal(Util.round(35.12345678), 35.123457);
  assert.equal(Util.round(35.12345678, 7), 35.1234568);
  assert.equal(Util.round(35.12345678, 2), 35.12);
});

test('Util.formatVal: Dateは引用符なしのISO文字列にする', () => {
  const { Util } = createSandbox({});
  assert.equal(Util.formatVal(new Date('2026-03-01T19:15:00.000Z')), '2026-03-01T19:15:00.000Z');
  assert.equal(Util.formatVal(new Date('invalid')), '');
});

test('Util.toNumber: 10進数表記のみ数値化する', () => {
  const { Util } = createSandbox({});
  assert.equal(Util.toNumber('35.5'), 35.5);
  assert.equal(Util.toNumber(' -139 '), -139);
  assert.equal(Util.toNumber('+1.25'), 1.25);
  assert.ok(Number.isNaN(Util.toNumber('')));
  assert.ok(Number.isNaN(Util.toNumber('1e3')));
  assert.ok(Number.isNaN(Util.toNumber('0x10')));
  assert.ok(Number.isNaN(Util.toNumber('35.5N')));
  assert.ok(Number.isNaN(Util.toNumber(null)));
});

test('Util.parseScalar: 数値は数値化し、先頭ゼロのコード値や文字列は保持する', () => {
  const { Util } = createSandbox({});
  assert.equal(Util.parseScalar(' 12 '), 12);
  assert.equal(Util.parseScalar('0.5'), 0.5);
  assert.equal(Util.parseScalar('0'), 0);
  assert.equal(Util.parseScalar('-3.25'), -3.25);
  assert.equal(Util.parseScalar('007'), '007', '郵便番号・コード値の先頭ゼロを落とさない');
  assert.equal(Util.parseScalar('5強'), '5強');
  assert.equal(Util.parseScalar('  text  '), 'text');
  assert.equal(Util.parseScalar(''), '');
});

test('Util.decodeText: UTF-8(BOM付き含む)とShift_JISを判別して復号する', () => {
  const { Util } = createSandbox({});
  const utf8 = new TextEncoder().encode('名称,緯度');
  assert.equal(Util.decodeText(utf8.buffer), '名称,緯度');
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
  assert.equal(Util.decodeText(bom.buffer), '名称,緯度', 'BOMは取り除かれる');
  // 「緯度」の Shift_JIS バイト列（UTF-8としては不正）
  const sjis = new Uint8Array([0x88, 0xdc, 0x93, 0x78]);
  assert.equal(Util.decodeText(sjis.buffer), '緯度');
});
