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

const Canvas = {
  // Starting canvas dimensions
  CANVAS_WIDTH:  800,
  CANVAS_HEIGHT: 600,
  
  DEFAULT_ZOOM: 1,
  MIN_ZOOM:     0,
  
  zoom: null,
  
  container: document.getElementById("canvasContainer"),
  canvas: document.getElementById("displayCanvas"),
  ctx: document.getElementById("displayCanvas").getContext("2d"),
  
  init() {
    // Set canvas size
    sessionCanvas.width = this.CANVAS_WIDTH;
    sessionCanvas.height = this.CANVAS_HEIGHT;
    this.canvas.width = this.CANVAS_WIDTH;
    this.canvas.height = this.CANVAS_HEIGHT;
    for (const client of Object.values(clients)) {
      client.canvas.width = this.CANVAS_WIDTH;
      client.canvas.height = this.CANVAS_HEIGHT;
    }
    // Start with the canvas cleared
    this.clearBlank(false);
  },
  
  // Zoom the canvas with the mouse wheel
  changeZoom(delta) {
    if (this.zoom + delta >= this.MIN_ZOOM) {
      this.zoom += delta;
      this.setZoom(this.zoom);
    }
  },
  // Set the canvas zoom with the number input
  setZoomValue(event) {
    this.setZoom(parseFloat(event.currentTarget.value / 100));
  },
  // Set the canvas zoom to whatever fits in the container, optionally only if it doesn't already fit
  zoomToWindow(type = "fit", allowLarger = true) {
    const widthZoom = (this.container.clientWidth - (15 * 2)) / sessionCanvas.width;
    const heightZoom = (this.container.clientHeight - (15 * 2)) / sessionCanvas.height;
    const fitZoom = type === "fit" ? Math.min(widthZoom, heightZoom) : Math.max(widthZoom, heightZoom);
    const newZoom = (fitZoom < this.zoom || allowLarger) ? fitZoom : this.zoom;
    this.setZoom(newZoom);
  },
  // Set the canvas zoom
  setZoom(zoom) {
    this.zoom = zoom;
    document.getElementById("canvasZoom").value = Math.round(this.zoom * 100);
    this.canvas.style.transform = `scale(${this.zoom})`;
  },
  
  update({ extras = [], save = false, only = null } = {}) {
    this.canvas.width = sessionCanvas.width;
    this.canvas.height = sessionCanvas.height;
    this.ctx.drawImage(sessionCanvas, 0, 0);
    
    if (only) {
      // Used in ActionHistory
      this.ctx.globalCompositeOperation = COMP_OPS[only.compOp];
      this.ctx.drawImage(clients[only.id].canvas, 0, 0);
    } else {
      const onTop = [];
      for (const clientId of Session.actionOrder) {
        const client = clients[clientId];
        // Selections are not part of the actual image
        // Type is only null when a selection is present but not currently being modified
        const type = client.action.type;
        if (type === null || type === "selecting" || type === "selection-move" || type === "selection-resize") {
          if (!save) {
            // Selections should be drawn on top of everything, save them for later
            onTop.push(clientId);
          }
          continue;
        }
        
        this.ctx.globalCompositeOperation = COMP_OPS[client.action.data.compOp] || DEFAULT_COMP_OP;
        this.ctx.drawImage(client.canvas, 0, 0);
      }
      for (const extra of extras) {
        this.ctx.globalCompositeOperation = COMP_OPS[extra.compOp];
        this.ctx.drawImage(extra.canvas, 0, 0);
      }
      
      // Selections don't have special composite operations
      this.ctx.globalCompositeOperation = DEFAULT_COMP_OP;
      for (const clientId of onTop) {
        this.ctx.drawImage(clients[clientId].canvas, 0, 0);
      }
    }
    this.ctx.globalCompositeOperation = DEFAULT_COMP_OP;
    if (save) {
      if (!only) {
        const tempCanvas = this._copyCanvas(this.canvas);
        // Update display canvas
        this.update({
          extras: extras,
          save: false,
          only: only
        });
        sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
        sessionCtx.drawImage(tempCanvas, 0, 0);
      } else {
        sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
        sessionCtx.drawImage(this.canvas, 0, 0);
      }
    }
  },
  
  // Export canvas image
  export() {
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = sessionCanvas.toDataURL("image/png");
    a.download = "image.png";
    a.click();
  },
  save() {
    const a = document.createElement("a");
    a.style.display = "none";
    const file = new Blob([msgpack.encode({
      undoActions: ActionHistory.undoActions,
      redoActions: ActionHistory.redoActions
    })], { type: "application/octet-stream" });
    const url = URL.createObjectURL(file);
    a.href = url;
    a.download = "image.bin";
    a.click();
    URL.revokeObjectURL(url);
  },
  open(event) {
    const file = event.currentTarget.files[0];
    const reader = new FileReader();
    reader.onerror = (event) => {
      window.alert("There was an error reading the file.\n\n" + reader.error);
      console.error(`Error reading file ${file}:`, event);
    };
    reader.onload = () => {
      Modal.open("retrieveModal");
      
      const backupHistory = {
        undo: ActionHistory.undoActions.slice(),
        redo: ActionHistory.redoActions.slice()
      };
      
      const data = new Uint8Array(reader.result);
      try {
        this.setup(msgpack.decode(data));
        // Only send to other clients if setup was successful
        Client.sendMessage({
          type: "open-canvas",
          file: data
        });
      } catch (err) {
        console.error("Error setting up canvas: " + err);
        ActionHistory.undoActions = backupHistory.undo;
        ActionHistory.redoActions = backupHistory.redo;
        ActionHistory.doAllActions();
        Modal.close("retrieveModal");
        Modal.open("oldCanvasFileModal");
      }
    };
    reader.readAsArrayBuffer(file);
  },
  
  setup(data) {
    this.init();
    // Zoom canvas to fit in canvasContainer if it doesn't already
    this.zoomToWindow("fit", false);
    sessionCtx.fillStyle = Colour.BLANK;
    sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    ActionHistory.undoActions = data.undoActions;
    ActionHistory.redoActions = data.redoActions;
    if (data.actions) {
      for (const [clientId, action] of Object.entries(data.actions.clients)) {
        clients[clientId].action = action;
      }
      Session.actionOrder = data.actions.order;
    }
    ActionHistory.doAllActions();
    Modal.close("retrieveModal");
  },
  
  // Get the position of the cursor relative to the canvas
  getCursorPos(event) {
    var mouse;
    if (typeof event.clientX === "undefined") {
      mouse = {
        x: event.changedTouches[0].clientX,
        y: event.changedTouches[0].clientY
      };
    } else {
      mouse = {
        x: event.clientX,
        y: event.clientY
      };
    }
    return {
      x: (((mouse.x + Canvas.container.scrollLeft) - (this.canvas.offsetLeft + (this.canvas.clientLeft * Canvas.zoom))) / Canvas.zoom) | 0,
      y: (((mouse.y + Canvas.container.scrollTop) - (this.canvas.offsetTop + (this.canvas.clientTop * Canvas.zoom))) / Canvas.zoom) | 0
    };
  },
  
  _copyCanvas(canvas) {
    const newCanvas = document.createElement("canvas");
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height;
    newCanvas.getContext("2d").drawImage(canvas, 0, 0);
    return newCanvas;
  },
  
  // Set the canvas size
  resize(options, user = true) {
    if (user) {
      ActionHistory.addToUndo({
        type: "resize-canvas",
        options: options
      });
    }
    const sessionCanvasCopy = this._copyCanvas(sessionCanvas);
    const clientCanvasCopies = {};
    for (const [clientId, client] of Object.entries(clients)) {
      clientCanvasCopies[clientId] = this._copyCanvas(client.canvas);
    }
    var changed = false;
    if (options.width !== sessionCanvas.width) {
      Client.canvas.width = options.width;
      sessionCanvas.width = options.width;
      for (const client of Object.values(clients)) {
        client.canvas.width = options.width;
      }
      changed = true;
    }
    if (options.height !== sessionCanvas.height) {
      Client.canvas.height = options.height;
      sessionCanvas.height = options.height;
      for (const client of Object.values(clients)) {
        client.canvas.height = options.height;
      }
      changed = true;
    }
    if (changed) {
      if (options.colour) {
        sessionCtx.fillStyle = options.colour;
        sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
        sessionCtx.clearRect(options.x, options.y, sessionCanvasCopy.width, sessionCanvasCopy.height);
      }
      // Canvas already filled with background colour
      sessionCtx.drawImage(sessionCanvasCopy, options.x, options.y);
      
      for (const [clientId, client] of Object.entries(clients)) {
        // Canvas already cleared from size change
        client.ctx.drawImage(clientCanvasCopies[clientId], options.x, options.y);
      }
    }
    Canvas.update();
  },
  
  // Import image and put on canvas
  importPicture(event) {
    switchTool("select");
    const file = event.currentTarget.files[0];
    const reader = new FileReader();
    reader.onerror = (event) => {
      window.alert("There was an error reading the file.\n\n" + reader.error);
      console.error(`Error reading file ${file}:`, event);
    };
    reader.onload = () => Selection.importPicture(reader.result, Client.id);
    reader.readAsDataURL(file);
  },
  
  // Clear the (session) canvas to the blank colour
  clearBlank(user = true) {
    if (user) {
      Client.sendMessage({
        type: "clear-blank"
      });
    }
    sessionCtx.fillStyle = Colour.BLANK;
    sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    this.ctx.fillStyle = Colour.BLANK;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (user) {
      ActionHistory.addToUndo({
        type: "clear-blank"
      });
    }
  },
  
  // Completely clear the (session) canvas
  clear(user = true) {
    if (user) {
      Client.sendMessage({
        type: "clear"
      });
    }
    sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (user) {
      ActionHistory.addToUndo({
        type: "clear"
      });
    }
  }
};
