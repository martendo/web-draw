/*
 * This file is part of Web Draw.
 *
 * Web Draw - A little real-time online collaborative drawing program.
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

class Selection {
  constructor({ selected, x, y, width, height, move, resize, flipped, data, old }) {
    this.selected = selected;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.move = move;
    this.resize = resize;
    this.flipped = flipped;
    this.data = data;
    this.old = old;
  }
  
  static packer(selection) {
    return msgpack.encode([
      selection.selected,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      selection.move,
      selection.resize,
      selection.flipped,
      selection.data,
      selection.old
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new Selection({
      selected: properties[0],
      x: properties[1],
      y: properties[2],
      width: properties[3],
      height: properties[4],
      move: properties[5],
      resize: properties[6],
      flipped: properties[7],
      data: properties[8],
      old: properties[9]
    });
  }
}
class ShortSelection {
  constructor({ selected, x, y, width, height, flipped }) {
    this.selected = selected;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.flipped = flipped;
  }
  
  static packer(shortSel) {
    return msgpack.encode([
      shortSel.x,
      shortSel.y,
      shortSel.width,
      shortSel.height,
      shortSel.flipped
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new ShortSelection({
      x: properties[0],
      y: properties[1],
      width: properties[2],
      height: properties[3],
      flipped: properties[4]
    });
  }
}
class SelectionResize {
  constructor({ handle, x, y }) {
    this.handle = handle;
    this.x = x;
    this.y = y;
  }
  
  static packer(selectionResize) {
    return msgpack.encode([
      selectionResize.handle,
      selectionResize.x,
      selectionResize.y
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new SelectionResize({
      handle: properties[0],
      x: properties[1],
      y: properties[2]
    });
  }
}
class OldSelection {
  constructor({ x, y, width, height }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
  
  static packer(old) {
    return msgpack.encode([
      old.x,
      old.y,
      old.width,
      old.height
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new OldSelection({
      x: properties[0],
      y: properties[1],
      width: properties[2],
      height: properties[3]
    });
  }
}

const SelectTool = {
  // Selection constants & variables
  HANDLE_SIZE: 5,
  HANDLE_GRAB_SIZE: 15,
  
  // Resize cursor names
  RESIZE_CURSORS: [
    "nwse-resize", "ns-resize", "nesw-resize",
    "ew-resize",                "ew-resize",
    "nesw-resize", "ns-resize", "nwse-resize"
  ],
  
  getResizeHandle(point, handles) {
    const selection = new Selection({...clients[Client.id].action.data});
    selection.x = selection.x * Canvas.zoom - Canvas.pan.x;
    selection.y = selection.y * Canvas.zoom - Canvas.pan.y;
    selection.width *= Canvas.zoom;
    selection.height *= Canvas.zoom;
    
    if (!selection.selected) return false;
    var handle = null;
    if (isPointInside(point.x, point.y, {
      x: selection.x - (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[0];
    } else if (isPointInside(point.x, point.y, {
      x: selection.x + (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y - (this.HANDLE_GRAB_SIZE / 2),
      width: selection.width - this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[1];
    } else if (isPointInside(point.x, point.y, {
      x: selection.x + selection.width - (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[2];
    } else if (isPointInside(point.x, point.y, {
      x: selection.x - (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y + (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: selection.height - this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[3];
    } else if (isPointInside(point.x, point.y, {
      x: selection.x + selection.width - (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y + (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: selection.height - this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[4];
    } else if (isPointInside(point.x, point.y, {
      x: selection.x - (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y + selection.height - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[5];
    } else if (isPointInside(point.x, point.y, {
      x: selection.x + (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y + selection.height - (this.HANDLE_GRAB_SIZE / 2),
      width: selection.width - this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[6];
    } else if (isPointInside(point.x, point.y, {
      x: selection.x + selection.width - (this.HANDLE_GRAB_SIZE / 2),
      y: selection.y + selection.height - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[7];
    }
    return handle;
  },
  
  draw(ctx, sel, handles, drawOld = true, adjust = false) {
    if (adjust) {
      sel = new Selection({...sel});
      sel.x = sel.x * Canvas.zoom - Canvas.pan.x;
      sel.y = sel.y * Canvas.zoom - Canvas.pan.y;
      sel.width *= Canvas.zoom;
      sel.height *= Canvas.zoom;
      if (sel.old && drawOld) {
        sel.old = new OldSelection({...sel.old});
        sel.old.x = sel.old.x * Canvas.zoom - Canvas.pan.x;
        sel.old.y = sel.old.y * Canvas.zoom - Canvas.pan.y;
        sel.old.width *= Canvas.zoom;
        sel.old.height *= Canvas.zoom;
      }
    } else {
      ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
    }
    
    // Previously selected area
    if (sel.old && drawOld) {
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.lineDashOffset = 0.5;
      ctx.strokeRect(Math.round(sel.old.x) + 0.5, Math.round(sel.old.y) + 0.5, Math.round(sel.old.width), Math.round(sel.old.height));
      ctx.strokeStyle = "#ffffff";
      ctx.lineDashOffset = 2.5;
      ctx.strokeRect(Math.round(sel.old.x) + 0.5, Math.round(sel.old.y) + 0.5, Math.round(sel.old.width), Math.round(sel.old.height));
    }
    
    // Selected image data
    if (sel.data) this.drawData(ctx, sel, adjust);
    
    // Selection box
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = 0.5;
    ctx.strokeRect(Math.round(sel.x) + 0.5, Math.round(sel.y) + 0.5, Math.round(sel.width), Math.round(sel.height));
    ctx.strokeStyle = "#ffffff";
    ctx.lineDashOffset = 5.5;
    ctx.strokeRect(Math.round(sel.x) + 0.5, Math.round(sel.y) + 0.5, Math.round(sel.width), Math.round(sel.height));
    ctx.setLineDash([]);
    
    if (handles) {
      // Selection resize handles
      // 0-1-2
      // 3   4
      // 5-6-7
      
      // FILL
      ctx.fillStyle = "#ffffff";
      // Top left
      ctx.fillRect(Math.round(sel.x - (this.HANDLE_SIZE / 2)), Math.round(sel.y - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top middle
      ctx.fillRect(Math.round(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2)), Math.round(sel.y - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top right
      ctx.fillRect(Math.round(sel.x + sel.width - (this.HANDLE_SIZE / 2)), Math.round(sel.y - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Left middle
      ctx.fillRect(Math.round(sel.x - (this.HANDLE_SIZE / 2)), Math.round(sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Right middle
      ctx.fillRect(Math.round(sel.x + sel.width - (this.HANDLE_SIZE / 2)), Math.round(sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom left
      ctx.fillRect(Math.round(sel.x - (this.HANDLE_SIZE / 2)), Math.round(sel.y + sel.height - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom middle
      ctx.fillRect(Math.round(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2)), Math.round(sel.y + sel.height - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom right
      ctx.fillRect(Math.round(sel.x + sel.width - (this.HANDLE_SIZE / 2)), Math.round(sel.y + sel.height - (this.HANDLE_SIZE / 2)),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // STROKE
      ctx.strokeStyle = "#000000";
      // Top left
      ctx.strokeRect(Math.round(sel.x - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top middle
      ctx.strokeRect(Math.round(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top right
      ctx.strokeRect(Math.round(sel.x + sel.width - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Left middle
      ctx.strokeRect(Math.round(sel.x - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Right middle
      ctx.strokeRect(Math.round(sel.x + sel.width - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom left
      ctx.strokeRect(Math.round(sel.x - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + sel.height - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom middle
      ctx.strokeRect(Math.round(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + sel.height - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom right
      ctx.strokeRect(Math.round(sel.x + sel.width - (this.HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + sel.height - (this.HANDLE_SIZE / 2)) + 0.5,
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
    }
    
    if (!adjust) Canvas.update();
  },
  update(handles) {
    const selection = clients[Client.id].action.data;
    
    this.draw(Client.ctx, selection, handles);
    this.updateSizeAndPos();
    
    // Send to other clients (remove unnecessary info too)
    Client.sendMessage({
      type: Message.SELECTION_UPDATE,
      selection: new ShortSelection({...selection}),
      clientId: Client.id
    });
  },
  updateSizeAndPos() {
    document.getElementById("selectionInfo").style.display = "";
    const selection = clients[Client.id].action;
    document.getElementById("selectPos").textContent = `${selection.data.x}, ${selection.data.y}`;
    document.getElementById("selectSize").textContent = `${selection.data.width}x${selection.data.height}`;
  },
  drawData(ctx, sel, adjust) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = sel.data.width;
    tempCanvas.height = sel.data.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.putImageData(sel.data, 0, 0);
    if (adjust) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(...[-Canvas.pan.x, -Canvas.pan.y, Session.canvas.width * Canvas.zoom, Session.canvas.height * Canvas.zoom].map((x) => Math.round(x)));
      ctx.clip();
    }
    ctx.translate(sel.flipped.x ? sel.width : 0, sel.flipped.y ? sel.height : 0);
    ctx.scale(sel.flipped.x ? -1 : 1, sel.flipped.y ? -1 : 1);
    const x = sel.x * (sel.flipped.x ? -1 : 1);
    const y = sel.y * (sel.flipped.y ? -1 : 1);
    ctx.drawImage(tempCanvas, x, y, sel.width, sel.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (adjust) {
      ctx.restore();
    } else {
      Canvas.update();
    }
  },
  
  cut(ctx, sel, colour) {
    this.copy(ctx, sel);
    this.clear(sel, colour);
  },
  copy(ctx, sel) {
    sel.data = Session.ctx.getImageData(sel.x, sel.y, sel.width, sel.height);
    this.draw(ctx, sel, true);
  },
  paste(sel, user = true) {
    if (sel.data) this.drawData(Session.ctx, sel);
    if (user) {
      ActionHistory.addToUndo("selection-paste", {
        x: sel.x,
        y: sel.y,
        width: sel.width,
        height: sel.height,
        flipped: sel.flipped,
        data: sel.data
      });
    }
  },
  clear(sel, colour, user = true) {
    Session.ctx.fillStyle = colour;
    Session.ctx.fillRect(sel.x, sel.y, sel.width, sel.height);
    Canvas.update();
    if (user) {
      ActionHistory.addToUndo("selection-clear", {
        x: sel.x,
        y: sel.y,
        width: sel.width,
        height: sel.height,
        colour: colour
      });
    }
  },
  doCopy() {
    if (!clients[Client.id].action.data.selected) return;
    Client.sendMessage({
      type: Message.SELECTION_COPY,
      clientId: Client.id
    });
    this.copy(Client.ctx, clients[Client.id].action.data);
  },
  doCut() {
    if (!clients[Client.id].action.data.selected) return;
    Client.sendMessage({
      type: Message.SELECTION_CUT,
      colour: penColours[1],
      clientId: Client.id
    });
    this.cut(Client.ctx, clients[Client.id].action.data, penColours[1]);
  },
  doPaste() {
    if (!clients[Client.id].action.data.selected || !clients[Client.id].action.data.data) return;
    Client.sendMessage({
      type: Message.SELECTION_PASTE,
      clientId: Client.id
    });
    this.paste(clients[Client.id].action.data);
  },
  remove() {
    Client.sendMessage({
      type: Message.SELECTION_REMOVE,
      clientId: Client.id
    });
    clients[Client.id].action = {...NO_ACTION};
    Session.endClientAction(Client.id);
    document.getElementById("selectionInfo").style.display = "none";
    Canvas.update();
  },
  
  importPicture(src, clientId) {
    const img = new Image();
    img.addEventListener("load", () => {
      if (clientId === Client.id) {
        Client.sendMessage({
          type: Message.IMPORT_PICTURE,
          image: img.src,
          clientId: Client.id
        });
      }
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      tempCtx.drawImage(img, 0, 0);
      const data = tempCtx.getImageData(0, 0, img.width, img.height);
      
      const selection = new Selection({
        selected: true,
        x: 0,
        y: 0,
        width: data.width,
        height: data.height,
        move: new Pos2D({
          x: null,
          y: null
        }),
        resize: new SelectionResize({
          handle: null,
          x: null,
          y: null
        }),
        flipped: new Pos2D({
          x: false,
          y: false
        }),
        data: data,
        old: null
      });
      Session.startClientAction(clientId, new Action({
        type: null, // Not editing the selection, but it should exist
        data: selection
      }));
      this.draw(clients[clientId].ctx, selection, clientId === Client.id, false);
      if (clientId === Client.id) this.updateSizeAndPos();
    });
    img.src = src;
  },
  
  adjustSizeAbsolute() {
    const selection = clients[Client.id].action;
    
    if (selection.data.width < 0) {
      selection.data.x += selection.data.width;
      selection.data.width = Math.abs(selection.data.width);
      if (selection.data.data) selection.data.flipped.x = !selection.data.flipped.x;
      if (selection.type === Action.SELECTION_RESIZE) {
        switch (selection.data.resize.handle) {
          case 0: {
            selection.data.resize.handle = 2;
            break;
          }
          case 2: {
            selection.data.resize.handle = 0;
            break;
          }
          case 3: {
            selection.data.resize.handle = 4;
            break;
          }
          case 4: {
            selection.data.resize.handle = 3;
            break;
          }
          case 5: {
            selection.data.resize.handle = 7;
            break;
          }
          case 7: {
            selection.data.resize.handle = 5;
            break;
          }
        }
      }
    }
    if (selection.data.height < 0) {
      selection.data.y += selection.data.height;
      selection.data.height = Math.abs(selection.data.height);
      if (selection.data.data) selection.data.flipped.y = !selection.data.flipped.y;
      if (selection.type === Action.SELECTION_RESIZE) {
        switch (selection.data.resize.handle) {
          case 0: {
            selection.data.resize.handle = 5;
            break;
          }
          case 5: {
            selection.data.resize.handle = 0;
            break;
          }
          case 1: {
            selection.data.resize.handle = 6;
            break;
          }
          case 6: {
            selection.data.resize.handle = 1;
            break;
          }
          case 2: {
            selection.data.resize.handle = 7;
            break;
          }
          case 7: {
            selection.data.resize.handle = 2;
            break;
          }
        }
      }
    }
    clients[Client.id].action = selection;
  }
};
