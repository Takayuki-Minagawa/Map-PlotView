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
