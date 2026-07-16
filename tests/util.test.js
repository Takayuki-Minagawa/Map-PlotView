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
