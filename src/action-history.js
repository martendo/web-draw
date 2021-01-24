/*
 * This file is part of Web Draw.
 *
 * Web Draw - A little real-time online drawing program.
 * Copyright (C) 2020-2021 martendo7
 *
 * Web Draw is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Web Draw is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Web Draw.  If not, see <https://www.gnu.org/licenses/>.
 */

const ActionHistory = {
  // All past actions (for undo) and undone actions (for redo)
  undoActions: [],
  redoActions: [],
  
  // Push an action onto this.undoActions, enable the undo button, disable the redo button
  addToUndo(data) {
    this.undoActions.push(data);
    this.enableUndo();
    this.clearRedo();
  },
  // Undo an action, and send a message to undo (from the user)
  doUndo() {
    Client.sendMessage({
      type: "undo"
    });
    this.undo();
  },
  // Actually undo an action
  undo() {
    const previousAction = this.undoActions.pop();
    if (previousAction) {
      this.redoActions.push(previousAction);
      Canvas.clearBlank(false);
      for (var i = 0; i < this.undoActions.length; i++) {
        this.doAction(this.undoActions[i]);
      }
      this.enableRedo();
    } else {
      this.clearUndo();
      return;
    }
    if (!this.undoActions.length) this.clearUndo();
  },
  
  // Redo an action, and send a message to redo (from the user)
  doRedo() {
    Client.sendMessage({
      type: "redo"
    });
    this.redo();
  },
  // Actually redo an action
  redo() {
    const previousAction = this.redoActions.pop();
    if (previousAction) {
      this.undoActions.push(previousAction);
      this.doAction(previousAction);
      this.enableUndo();
    } else {
      this.clearRedo();
      return;
    }
    if (!this.redoActions.length) this.clearRedo();
  },
  // Handle different types of actions
  doAction(action) {
    switch (action.type) {
      case "stroke": {
        Pen.drawStroke(thisCtx, action.stroke, true);
        break;
      }
      case "fill": {
        Fill.fill(action.x, action.y, action.colour, action.threshold, action.opacity, action.compOp, action.fillBy, action.changeAlpha, false);
        break;
      }
      case "clear": {
        Canvas.clear(false);
        break;
      }
      case "clear-blank": {
        Canvas.clearBlank(false);
        break;
      }
      case "selection-clear": {
        Selection.clear(action.selection, action.colour, false);
        break;
      }
      case "selection-paste": {
        const sel = {...action.selection};
        sel.data = new ImageData(
          new Uint8ClampedArray(action.selection.data.data),
          action.selection.data.width,
          action.selection.data.height
        );
        Selection.paste(sel, false);
        break;
      }
      case "line": {
        Line.draw(action.line, thisCtx, true);
        break;
      }
      case "rect": {
        Rect.draw(action.rect, thisCtx, true);
        break;
      }
      case "ellipse": {
        Ellipse.draw(action.ellipse, thisCtx, true);
        break;
      }
    }
  },
  
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  
  // Enable undo/redo buttons
  enableUndo() {
    this.undoBtn.disabled = false;
  },
  enableRedo() {
    this.redoBtn.disabled = false;
  },
  // Disable undo/redo buttons and clear the actions just in case
  clearUndo() {
    this.undoActions = [];
    this.undoBtn.disabled = true;
    // KeyboardEvents do not fire when a disabled button is focused
    this.undoBtn.blur();
  },
  clearRedo() {
    this.redoActions = [];
    this.redoBtn.disabled = true;
    // KeyboardEvents do not fire when a disabled button is focused
    this.redoBtn.blur();
  }
};
