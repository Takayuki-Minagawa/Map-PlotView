/* tests/helpers/load.js — ブラウザ用IIFEモジュールをNodeのサンドボックスへ読み込むヘルパ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

/* 疑似グローバル(window相当)を作る。overridesでjsyaml等を注入できる。 */
function createSandbox(overrides) {
  return Object.assign({}, overrides);
}

/* js/<name> を読み、sandbox を window として評価する。
 * IIFE末尾の (typeof window !== 'undefined' ? window : this) が sandbox を掴む。
 * document / localStorage は未定義のまま渡し、typeofガードを有効にする。 */
function loadScript(name, sandbox) {
  const code = fs.readFileSync(path.join(ROOT, 'js', name), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', code);
  fn.call(sandbox, sandbox, undefined, undefined);
  return sandbox;
}

module.exports = { createSandbox, loadScript, ROOT };
