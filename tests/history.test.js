'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadScript } = require('./helpers/load');

function newHistory(limit) {
  const sandbox = createSandbox({});
  loadScript('history.js', sandbox);
  return new sandbox.UndoHistory(limit);
}

test('UndoHistory: record → undo → redo で状態を行き来する', () => {
  const h = newHistory();
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo('now'), null, '履歴が無ければnull');

  h.record('s0');           // s0 → s1 へ変更
  h.record('s1');           // s1 → s2 へ変更
  assert.equal(h.canUndo(), true);

  assert.equal(h.undo('s2'), 's1');
  assert.equal(h.undo('s1'), 's0');
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), true);

  assert.equal(h.redo('s0'), 's1');
  assert.equal(h.redo('s1'), 's2');
  assert.equal(h.redo('s2'), null);
  assert.equal(h.canUndo(), true);
});

test('UndoHistory: 新しい操作でやり直し履歴を破棄する', () => {
  const h = newHistory();
  h.record('s0');
  assert.equal(h.undo('s1'), 's0');
  assert.equal(h.canRedo(), true);
  h.record('s0');           // s0 から別の変更を加えた
  assert.equal(h.canRedo(), false);
});

test('UndoHistory: 上限を超えた古い履歴から捨てる', () => {
  const h = newHistory(2);
  h.record('a'); h.record('b'); h.record('c');
  assert.equal(h.undo('d'), 'c');
  assert.equal(h.undo('c'), 'b');
  assert.equal(h.undo('b'), null, '最古の a は破棄済み');
});

test('UndoHistory: clear で両方の履歴を空にする', () => {
  const h = newHistory();
  h.record('a');
  h.undo('b');
  h.record('a');
  h.clear();
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
});
