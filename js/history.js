/* history.js — 元に戻す/やり直しのスナップショット履歴
 * スナップショットの中身には関知しない。呼び出し側が「変更前の状態」を record し、
 * undo/redo では「現在の状態」を渡して入れ替える。
 */
(function (global) {
  'use strict';

  function UndoHistory(limit) {
    this.limit = limit > 0 ? limit : 50;
    this.undoStack = [];
    this.redoStack = [];
  }

  /* 変更を加える直前の状態を積む。新しい操作をしたらやり直し履歴は破棄する。 */
  UndoHistory.prototype.record = function (snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  };

  /* 1つ前の状態を返す（無ければnull）。current はやり直し用に保持する。 */
  UndoHistory.prototype.undo = function (current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(current);
    return this.undoStack.pop();
  };

  /* 取り消した状態を返す（無ければnull）。current は元に戻す用に保持する。 */
  UndoHistory.prototype.redo = function (current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(current);
    return this.redoStack.pop();
  };

  UndoHistory.prototype.canUndo = function () { return this.undoStack.length > 0; };
  UndoHistory.prototype.canRedo = function () { return this.redoStack.length > 0; };

  UndoHistory.prototype.clear = function () {
    this.undoStack = [];
    this.redoStack = [];
  };

  global.UndoHistory = UndoHistory;
})(typeof window !== 'undefined' ? window : this);
