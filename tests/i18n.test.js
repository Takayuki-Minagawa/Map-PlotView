'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadScript } = require('./helpers/load');

function newI18n() {
  const sandbox = createSandbox({});
  loadScript('i18n.js', sandbox);
  return sandbox.I18n;
}

test('t: 既定言語(ja)の訳語と変数展開', () => {
  const I18n = newI18n();
  assert.equal(I18n.getLanguage(), 'ja');
  assert.equal(I18n.t('edit'), '編集');
  assert.equal(I18n.t('selectedCount', { count: 3 }), '（3件）');
  assert.equal(I18n.t('loadError', { message: 'x' }), '読込エラー: x');
});

test('t: 未知キーはキー自身を返し、変数欠落は空文字になる', () => {
  const I18n = newI18n();
  assert.equal(I18n.t('__nosuchkey__'), '__nosuchkey__');
  assert.equal(I18n.t('selectedCount', {}), '（件）');
});

test('typeLabel: point/line/polygon の表示名', () => {
  const I18n = newI18n();
  assert.equal(I18n.typeLabel('point'), '点');
  assert.equal(I18n.typeLabel('line'), '線');
  assert.equal(I18n.typeLabel('polygon'), '面');
});

test('訳語: ja と en のキー集合が一致する', () => {
  const sandbox = createSandbox({});
  loadScript('i18n.js', sandbox);
  const I18n = sandbox.I18n;
  const fs = require('node:fs');
  const path = require('node:path');
  const { ROOT } = require('./helpers/load');
  // i18n.js の辞書から ja / en それぞれのキーを抜き出す
  const src = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
  const jaBlock = src.slice(src.indexOf('    ja: {'), src.indexOf('    en: {'));
  const enBlock = src.slice(src.indexOf('    en: {'), src.indexOf('  var MANUAL'));
  const keysOf = block => Array.from(block.matchAll(/^ {6}(\w+):/gm), m => m[1]).sort();
  const ja = keysOf(jaBlock);
  const en = keysOf(enBlock);
  assert.ok(ja.length > 100, '辞書を抽出できている');
  assert.deepEqual(en, ja);
  assert.equal(new Set(ja).size, ja.length, 'キーの重複が無い');
  assert.equal(I18n.t('undo'), '元に戻す');
});

test('訳語: JS / HTML から参照されるキーがすべて辞書に存在する', () => {
  const sandbox = createSandbox({});
  loadScript('i18n.js', sandbox);
  const I18n = sandbox.I18n;
  const fs = require('node:fs');
  const path = require('node:path');
  const { ROOT } = require('./helpers/load');
  const used = new Set();
  for (const name of fs.readdirSync(path.join(ROOT, 'js'))) {
    const code = fs.readFileSync(path.join(ROOT, 'js', name), 'utf8');
    for (const m of code.matchAll(/\b(?:tr|t)\('([A-Za-z]\w*)'/g)) used.add(m[1]);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-title|-placeholder|-aria)?="(\w+)"/g)) used.add(m[1]);
  assert.ok(used.size > 80, '参照キーを抽出できている');
  const missing = Array.from(used).filter(k => I18n.t(k) === k);
  assert.deepEqual(missing, [], '辞書に無いキー: ' + missing.join(', '));
});
