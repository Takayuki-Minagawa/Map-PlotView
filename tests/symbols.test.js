'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadScript } = require('./helpers/load');

function newSymbols() {
  const sandbox = createSandbox({});
  loadScript('symbols.js', sandbox);
  return sandbox.Symbols;
}

test('glyphFor: 既知の記号名はグリフへ、未指定はpin、未知はそのまま', () => {
  const Symbols = newSymbols();
  assert.equal(Symbols.glyphFor('building'), '🏢');
  assert.equal(Symbols.glyphFor(undefined), Symbols.GLYPHS.pin);
  assert.equal(Symbols.glyphFor('◆'), '◆', '未知の1文字記号はそのまま使う');
});

test('escapeHtml: HTML特殊文字をエスケープする', () => {
  const Symbols = newSymbols();
  assert.equal(
    Symbols.escapeHtml('<img src=x onerror="a&b\'">'),
    '&lt;img src=x onerror=&quot;a&amp;b&#39;&quot;&gt;'
  );
  assert.equal(Symbols.escapeHtml(123), '123', '非文字列もStringとして処理');
});
