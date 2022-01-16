/*
 * This file is part of Web Draw.
 *
 * Web Draw - A little real-time online collaborative drawing program.
 * Copyright (C) 2020-2022 martendo
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

class PastAction {
  constructor({ enabled, type, data }) {
    this.enabled = enabled;
    this.type = type;
    this.data = data;
  }
  
  static packer(action) {
    return msgpack.encode([
      action.enabled,
      action.type,
      action.data,
    ]).slice(1);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode([0x93, ...new Uint8Array(buffer)]);
    return new PastAction({
      enabled: properties[0],
      type: properties[1],
      data: properties[2],
    });
  }
}
PastAction.BASE = 0;
PastAction.STROKE = 1;
PastAction.FILL = 2;
PastAction.SELECTION_CLEAR = 3;
PastAction.SELECTION_PASTE = 4;
PastAction.LINE = 5;
PastAction.RECT = 6;
PastAction.ELLIPSE = 7;
PastAction.CLEAR = 8;
PastAction.CLEAR_BLANK = 9;
PastAction.RESIZE_CANVAS = 10;

const ActionHistory = {
  // All actions made to the session canvas
  actions: [],
  // The current position in history
  pos: -1,
  
  // Clear redoable actions, push an action onto action history, enable the undo button
  append(type, data = null) {
    this.clearRedo();
    this.actions.push(new PastAction({
      enabled: true,
      type: type,
      data: data,
    }));
    this.pos++;
    this.enableAvailableButtons();
    this.addActionToTable(type);
  },
  // Undo an action, and send a message to undo (from the user)
  moveWithOffset(offset) {
    var num = this.pos + offset;
    while (num >= 0 && num < this.actions.length && !this.actions[num].enabled) {
      num += offset;
    }
    if (num < 0 || num >= this.actions.length) {
      return;
    }
    Client.sendMessage({
      type: Message.MOVE_HISTORY,
      num: num,
    });
    this.moveTo(num);
  },
  // Undo/Redo an action
  moveTo(num) {
    if (num === this.pos) {
      return;
    } else if (num < this.pos) {
      // Undo
      while (this.pos > num) {
        this.pos--;
        if (this.pos <= 0) {
          break;
        }
      }
      Canvas.init();
      for (var i = 0; i <= this.pos; i++) {
        this.doAction(this.actions[i]);
      }
    } else {
      // Redo
      while (num > this.pos) {
        this.pos++;
        if (this.pos >= this.actions.length) {
          break;
        }
        this.doAction(this.actions[this.pos]);
      }
    }
    Session.drawCurrentActions();
    this.updateLastAction();
    this.enableAvailableButtons();
  },
  
  toggleAction(num, user = true) {
    if (user) {
      Client.sendMessage({
        type: Message.TOGGLE_ACTION,
        num: num,
      });
    }
    const action = this.actions[num];
    action.enabled = !action.enabled;
    this.doAllActions();
    return action.enabled;
  },
  moveAction(num, offset, user = true) {
    if (user) {
      Client.sendMessage({
        type: Message.MOVE_ACTION,
        num: num,
        offset: offset,
      });
    }
    const action = this.actions.splice(num, 1)[0];
    num += offset;
    this.actions.splice(num, 0, action);
    this.doAllActions();
  },
  
  // Handle different types of actions
  doAction(action) {
    if (!action.enabled) {
      return;
    }
    
    switch (action.type) {
      case PastAction.STROKE: {
        PenTool.drawStroke(Client.ctx, action.data, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.data.compOp,
          },
        });
        break;
      }
      case PastAction.FILL: {
        FillTool.fill(action.data, false);
        break;
      }
      case PastAction.CLEAR: {
        Canvas.clear(false);
        break;
      }
      case PastAction.CLEAR_BLANK: {
        Canvas.clearBlank(false);
        break;
      }
      case PastAction.RESIZE_CANVAS: {
        Canvas.resize(action.data, false);
        break;
      }
      case PastAction.SELECTION_CLEAR: {
        SelectTool.clear(action.data, action.data.colour, false);
        break;
      }
      case PastAction.SELECTION_PASTE: {
        SelectTool.paste(action.data, false);
        break;
      }
      case PastAction.LINE: {
        LineTool.draw(action.data, Client.ctx, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.data.compOp,
          },
        });
        break;
      }
      case PastAction.RECT: {
        RectTool.draw(action.data, Client.ctx, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.data.compOp,
          },
        });
        break;
      }
      case PastAction.ELLIPSE: {
        EllipseTool.draw(action.data, Client.ctx, {
          save: true,
          only: {
            id: Client.id,
            compOp: action.data.compOp,
          },
        });
        break;
      }
    }
  },
  
  doAllActions() {
    // Save scroll amount because the table will be deleted
    const rightBoxContent = document.getElementById("rightBoxContent");
    const tempScrollTop = rightBoxContent.scrollTop;
    
    [...this._table.children[0].children].forEach((el) => {
      el.remove();
    });
    
    Canvas.init();
    // Add all actions to the action history table
    for (const action of this.actions) {
      this.doAction(action);
      this.addActionToTable(action.type, action.enabled, false);
    }
    
    // Restore scroll
    rightBoxContent.scrollTop = tempScrollTop;
    
    // Undo the redone actions (only done to get canvas images for history)
    Canvas.init();
    for (var i = 0; i <= this.pos; i++) {
      this.doAction(this.actions[i]);
    }
    this.updateLastAction();
    this.enableAvailableButtons();
    Session.drawCurrentActions();
  },
  
  // Action history table
  _table: document.getElementById("historyTabBox"),
  
  addActionToTable(type, enabled = true, updateLast = true) {
    var num = this._table.children[0].children.length - 1;
    
    // Add button to previous action to move down
    const prevRow = this._table.children[0].children[num];
    if (prevRow) {
      if (prevRow.getElementsByClassName("actionMoveDown").length < 1) {
        const cells = prevRow.getElementsByClassName("actionButtons");
        if (cells.length > 0) {
          cells[1].appendChild(this._makeButton(
            Images.DOWN,
            "actionMoveDown",
            () => this.moveAction(num, +1),
            "Move this action down",
          ));
        }
      }
    }
    
    var editable = true;
    // Show a user-friendly action name
    var name;
    switch (type) {
      case PastAction.BASE: {
        name = "[ Base Image ]";
        editable = false;
        break;
      }
      case PastAction.STROKE: {
        name = "Pen";
        break;
      }
      case PastAction.FILL: {
        name = "Flood fill";
        break;
      }
      case PastAction.LINE: {
        name = "Line";
        break;
      }
      case PastAction.RECT: {
        name = "Rectangle";
        break;
      }
      case PastAction.ELLIPSE: {
        name = "Ellipse";
        break;
      }
      case PastAction.SELECTION_PASTE: {
        name = "Paste selection";
        break;
      }
      case PastAction.SELECTION_CLEAR: {
        name = "Clear selection";
        break;
      }
      case PastAction.CLEAR_BLANK: {
        name = "Clear canvas";
        break;
      }
      case PastAction.CLEAR: {
        name = "Clear canvas to transparent";
        break;
      }
      case PastAction.RESIZE_CANVAS: {
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
      if (event.target.tagName === "IMG") {
        return;
      }
      Client.sendMessage({
        type: Message.MOVE_HISTORY,
        num: num,
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
    const imageCell = row.insertCell(-1);
    imageCell.classList.add("actionHistoryImageCell");
    imageCell.appendChild(image);
    
    const nameCell = row.insertCell(-1);
    nameCell.classList.add("actionName");
    nameCell.textContent = name;
    
    if (!editable) {
      nameCell.colSpan = 3;
    } else {
      const toggleCell = row.insertCell(-1);
      toggleCell.classList.add("actionButtons");
      toggleCell.appendChild(this._makeButton(
        enabled ? Images.VISIBLE : Images.NO_VISIBLE,
        "actionToggle",
        () => this.toggleAction(num),
        "Toggle this action",
      ));
      
      const moveCell = row.insertCell(-1);
      moveCell.classList.add("actionButtons");
      if (num > 1) {
        moveCell.appendChild(this._makeButton(
          Images.UP,
          "actionMoveUp",
          () => this.moveAction(num, -1),
          "Move this action up",
        ));
      }
      
      if (num < this.actions.length - 1) {
        moveCell.appendChild(this._makeButton(
          Images.DOWN,
          "actionMoveDown",
          () => this.moveAction(num, +1),
          "Move this action down",
        ));
      }
    }
    
    if (updateLast) {
      this.updateLastAction();
    }
  },
  _makeButton(img, btnClass, clickHandler, title) {
    const btn = document.createElement("img");
    btn.title = title;
    btn.src = img;
    btn.addEventListener("click", clickHandler);
    btn.classList.add(btnClass);
    return btn;
  },
  updateLastAction() {
    [...document.getElementsByClassName("lastAction")].forEach((el) => {
      el.classList.remove("lastAction");
    });
    // children[0] = <tbody>
    this._table.children[0].children[this.pos].classList.add("lastAction");
  },
  
  reset() {
    this.actions = [];
    this.pos = -1;
    this.disableUndo();
    this.disableRedo();
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
  disableUndo() {
    this._undoBtn.disabled = true;
    // KeyboardEvents do not fire when a disabled button is focused
    this._undoBtn.blur();
  },
  disableRedo() {
    this._redoBtn.disabled = true;
    // KeyboardEvents do not fire when a disabled button is focused
    this._redoBtn.blur();
  },
  // Disable undo/redo buttons and clear the actions just in case
  clearUndo() {
    this.pos -= this.actions.splice(0, this.pos).length;
    this.disableUndo();
  },
  clearRedo() {
    this.actions.splice(this.pos + 1, this.actions.length - (this.pos + 1));
    this.disableRedo();
    
    // Remove redo actions from action history table - they've been erased
    [...this._table.children[0].children].slice(this.pos + 1).forEach((el) => {
      el.remove();
    });
  },
  enableAvailableButtons() {
    if (this.actions.slice(0, this.pos).some((action) => action.enabled)) {
      this.enableUndo();
    } else {
      this.disableUndo();
    }
    if (this.actions.slice(this.pos + 1).some((action) => action.enabled)) {
      this.enableRedo();
    } else {
      this.disableRedo();
    }
  },
};
