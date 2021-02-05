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
  
  // Push an action onto this.undoActions, enable the undo button, clear this.redoActions
  addToUndo(data) {
    this.undoActions.push({
      enabled: true,
      data: data
    });
    this.enableUndo();
    this.clearRedo();
    this.removeRedoActionsFromTable();
    this.addActionToTable(data.type);
  },
  // Undo an action, and send a message to undo (from the user)
  moveWithOffset(offset) {
    const num = this.undoActions.length + offset;
    Client.sendMessage({
      type: "move-history",
      num: num
    });
    this.moveTo(num);
  },
  // Undo/Redo an action
  moveTo(num) {
    const offset = num - this.undoActions.length;
    if (offset < 0) {
      // Undo
      for (var i = 0; i < -offset; i++) {
        const previousAction = this.undoActions.pop();
        if (previousAction) {
          this.redoActions.push(previousAction);
          Canvas.init();
          for (const action of this.undoActions) {
            this.doAction(action);
          }
          this.enableRedo();
          Session.drawCurrentActions();
          this.updateLastAction();
        } else {
          this.clearUndo();
          return;
        }
        if (!this.undoActions.length) {
          this.clearUndo();
          return;
        }
      }
    } else {
      // Redo
      for (var i = 0; i < offset; i++) {
        const previousAction = this.redoActions.pop();
        if (previousAction) {
          this.undoActions.push(previousAction);
          this.doAction(previousAction);
          this.enableUndo();
          Session.drawCurrentActions();
          this.updateLastAction();
        } else {
          this.clearRedo();
          return;
        }
        if (!this.redoActions.length) {
          this.clearRedo();
          return;
        }
      }
    }
  },
  
  _getRedoPos(num) {
    return this.redoActions.length - 1 - (num - this.undoActions.length);
  },
  toggleAction(num, user = true) {
    if (user) {
      Client.sendMessage({
        type: "toggle-action",
        num: num
      });
    }
    num--;
    var action;
    if (num < this.undoActions.length) {
      action = this.undoActions[num];
    } else {
      action = this.redoActions[this._getRedoPos(num)];
    }
    action.enabled = !action.enabled;
    this.doAllActions();
    return action.enabled;
  },
  moveAction(num, offset, user = true) {
    if (user) {
      Client.sendMessage({
        type: "move-action",
        num: num,
        offset: offset
      });
    }
    num--;
    var action;
    if (num < this.undoActions.length) {
      action = this.undoActions.splice(num, 1)[0];
    } else {
      action = this.redoActions.splice(this._getRedoPos(num), 1)[0];
    }
    num += offset;
    if (num < this.undoActions.length) {
      this.undoActions.splice(num, 0, action);
    } else {
      this.redoActions.splice(this._getRedoPos(num) + 1, 0, action);
    }
    this.doAllActions();
  },
  
  // Handle different types of actions
  doAction(action) {
    if (!action.enabled) return;
    
    action = action.data;
    switch (action.type) {
      case "stroke": {
        Pen.drawStroke(Client.ctx, action.stroke, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.stroke.compOp
          }
        });
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
      case "resize-canvas": {
        Canvas.resize(action.options, false);
        break;
      }
      case "selection-clear": {
        Selection.clear(action.selection, action.colour, false);
        break;
      }
      case "selection-paste": {
        const sel = {...action.selection};
        sel.data = new ImageData(
          action.selection.data.data,
          action.selection.data.width,
          action.selection.data.height
        );
        Selection.paste(sel, false);
        break;
      }
      case "line": {
        Line.draw(action.line, Client.ctx, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.line.compOp
          }
        });
        break;
      }
      case "rect": {
        Rect.draw(action.rect, Client.ctx, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.rect.compOp
          }
        });
        break;
      }
      case "ellipse": {
        Ellipse.draw(action.ellipse, Client.ctx, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.ellipse.compOp
          }
        });
        break;
      }
    }
  },
  
  doAllActions() {
    [...this._table.children[0].children].slice(1).forEach((el) => {
      el.remove();
    });
    
    Canvas.init();
    // Add all actions to the action history table
    for (const action of this.undoActions.concat(this.redoActions.slice().reverse())) {
      this.doAction(action);
      this.addActionToTable(action.data.type, action.enabled, false);
    }
    // Undo the redone actions (only done to get canvas images for history)
    Canvas.init();
    for (const action of this.undoActions) {
      this.doAction(action);
    }
    this.updateLastAction();
    
    if (this.undoActions.length) {
      this.enableUndo();
    } else {
      this.clearUndo();
    }
    if (this.redoActions.length) {
      this.enableRedo();
    } else {
      this.clearRedo();
    }
    Session.drawCurrentActions();
  },
  
  // Action history table
  _table: document.getElementById("historyTabBox"),
  
  addActionToTable(name, enabled = true, updateLast = true) {
    var num = this._table.children[0].children.length - 1;
    
    // Add button to previous action to move down
    const prevRow = this._table.children[0].children[num];
    if (prevRow) {
      if (!prevRow.getElementsByClassName("actionMoveDown").length) {
        const cells = prevRow.getElementsByClassName("actionButtons");
        if (cells.length) {
          const btn = document.createElement("img");
          btn.classList.add("actionMoveDown");
          btn.title = "Move this action down";
          btn.src = Icons.down;
          btn.addEventListener("click", () => this.moveAction(num, +1));
          cells[1].appendChild(btn);
        }
      }
    }
    
    var editable = true;
    // Make names more user-friendly
    switch (name) {
      case "stroke": {
        name = "Pen";
        break;
      }
      case "fill": {
        name = "Flood fill";
        break;
      }
      case "line": {
        name = "Line";
        break;
      }
      case "rect": {
        name = "Rectangle";
        break;
      }
      case "ellipse": {
        name = "Ellipse";
        break;
      }
      case "selection-paste": {
        name = "Paste";
        break;
      }
      case "selection-clear": {
        name = "Clear selection";
        break;
      }
      case "clear-blank": {
        name = "Clear canvas";
        break;
      }
      case "clear": {
        name = "Clear canvas to transparent";
        break;
      }
      case "resize-canvas": {
        name = "Resize canvas";
        break;
      }
      default: {
        editable = false;
        break;
      }
    }
    
    const row = this._table.insertRow(-1);
    num++;
    row.addEventListener("click", (event) => {
      if (event.target.tagName === "IMG") return;
      Client.sendMessage({
        type: "move-history",
        num: num
      });
      this.moveTo(num);
    });
    const image = document.createElement("canvas");
    image.classList.add("actionHistoryImage");
    if (Session.canvas.width > Session.canvas.height) {
      image.width = 60;
      image.height = Session.canvas.height / (Session.canvas.width / 60);
    } else {
      image.height = 45;
      image.width = Session.canvas.width / (Session.canvas.height / 45);
    }
    image.getContext("2d").drawImage(Session.canvas, 0, 0, image.width, image.height);
    row.insertCell(-1).appendChild(image);
    
    const nameCell = row.insertCell(-1);
    nameCell.classList.add("actionName");
    nameCell.textContent = name;
    
    if (!editable) {
      nameCell.colSpan = 3;
    } else {
      const toggleCell = row.insertCell(-1);
      toggleCell.classList.add("actionButtons");
      const toggleBtn = document.createElement("img");
      toggleBtn.title = "Toggle this action";
      toggleBtn.src = enabled ? Icons.visible : Icons.noVisible;
      toggleBtn.addEventListener("click", () => this.toggleAction(num));
      toggleCell.appendChild(toggleBtn);
      
      const moveCell = row.insertCell(-1);
      moveCell.classList.add("actionButtons");
      if (num > 1) {
        const upBtn = document.createElement("img");
        upBtn.title = "Move this action up";
        upBtn.src = Icons.up;
        upBtn.addEventListener("click", () => this.moveAction(num, -1));
        moveCell.appendChild(upBtn);
      }
      
      if (num < this.undoActions.length + this.redoActions.length) {
        const downBtn = document.createElement("img");
        downBtn.classList.add("actionMoveDown");
        downBtn.title = "Move this action down";
        downBtn.src = Icons.down;
        downBtn.addEventListener("click", () => this.moveAction(num, +1));
        moveCell.appendChild(downBtn);
      }
    }
    
    if (updateLast) this.updateLastAction();
  },
  updateLastAction() {
    [...document.getElementsByClassName("lastAction")].forEach((el) => {
      el.classList.remove("lastAction");
    });
    // children[0] = <tbody>
    this._table.children[0].children[this.undoActions.length].classList.add("lastAction");
  },
  removeRedoActionsFromTable() {
    [...this._table.children[0].children].slice(this.undoActions.length).forEach((el) => {
      el.remove();
    });
  },
  
  _undoBtn: document.getElementById("undoBtn"),
  _redoBtn: document.getElementById("redoBtn"),
  
  // Enable undo/redo buttons
  enableUndo() {
    this._undoBtn.disabled = false;
  },
  enableRedo() {
    this._redoBtn.disabled = false;
  },
  // Disable undo/redo buttons and clear the actions just in case
  clearUndo() {
    this.undoActions = [];
    this._undoBtn.disabled = true;
    // KeyboardEvents do not fire when a disabled button is focused
    this._undoBtn.blur();
  },
  clearRedo() {
    this.redoActions = [];
    this._redoBtn.disabled = true;
    // KeyboardEvents do not fire when a disabled button is focused
    this._redoBtn.blur();
  }
};
