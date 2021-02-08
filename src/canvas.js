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

const Canvas = {
  // Starting canvas dimensions
  CANVAS_WIDTH:  800,
  CANVAS_HEIGHT: 600,
  
  DEFAULT_ZOOM: 1,
  MIN_ZOOM:     0,
  
  zoom: null,
  pan: {
    x: 0,
    y: 0
  },
  
  container: document.getElementById("canvasContainer"),
  displayCanvas: document.getElementById("displayCanvas"),
  displayCtx: document.getElementById("displayCanvas").getContext("2d"),
  mixingCanvas: document.createElement("canvas"),
  mixingCtx: null,
  
  init() {
    // Set canvas size
    Session.canvas.width = this.CANVAS_WIDTH;
    Session.canvas.height = this.CANVAS_HEIGHT;
    this.mixingCanvas.width = this.CANVAS_WIDTH;
    this.mixingCanvas.height = this.CANVAS_HEIGHT;
    this.displayCanvas.width = this.container.clientWidth;
    this.displayCanvas.height = this.container.clientHeight;
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
  // Set the canvas zoom to whatever fits in the canvas area, optionally only if it doesn't already fit
  zoomToWindow(type = "fit", allowLarger = true) {
    const widthZoom = this.displayCanvas.width / Session.canvas.width;
    const heightZoom = this.displayCanvas.height / Session.canvas.height;
    const fitZoom = type === "fit" ? Math.min(widthZoom, heightZoom) : Math.max(widthZoom, heightZoom);
    const newZoom = (fitZoom < this.zoom || allowLarger) ? fitZoom : this.zoom;
    this.setZoom(newZoom);
  },
  // Set the canvas zoom
  setZoom(zoom) {
    this.zoom = zoom;
    document.getElementById("canvasZoom").value = Math.round(this.zoom * 100);
    this.drawCanvas();
  },
  
  update({ extras = [], save = false, only = null } = {}) {
    this.mixingCanvas.width = Session.canvas.width;
    this.mixingCanvas.height = Session.canvas.height;
    this.mixingCtx.drawImage(Session.canvas, 0, 0);
    
    if (only) {
      // Used in ActionHistory
      this.mixingCtx.globalCompositeOperation = COMP_OPS[only.compOp];
      this.mixingCtx.drawImage(clients[only.id].canvas, 0, 0);
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
        
        this.mixingCtx.globalCompositeOperation = COMP_OPS[client.action.data.compOp] || DEFAULT_COMP_OP;
        this.mixingCtx.drawImage(client.canvas, 0, 0);
      }
      for (const extra of extras) {
        this.mixingCtx.globalCompositeOperation = COMP_OPS[extra.compOp];
        this.mixingCtx.drawImage(extra.canvas, 0, 0);
      }
      
      // Selections don't have special composite operations
      this.mixingCtx.globalCompositeOperation = DEFAULT_COMP_OP;
      for (const clientId of onTop) {
        this.mixingCtx.drawImage(clients[clientId].canvas, 0, 0);
      }
    }
    this.mixingCtx.globalCompositeOperation = DEFAULT_COMP_OP;
    if (save) {
      if (!only) {
        const tempCanvas = this._copyCanvas(this.mixingCanvas);
        // Update display canvas
        this.update({
          extras: extras,
          save: false,
          only: only
        });
        Session.ctx.clearRect(0, 0, Session.canvas.width, Session.canvas.height);
        Session.ctx.drawImage(tempCanvas, 0, 0);
      } else {
        Session.ctx.clearRect(0, 0, Session.canvas.width, Session.canvas.height);
        Session.ctx.drawImage(this.mixingCanvas, 0, 0);
      }
    }
    this.drawCanvas();
  },
  drawCanvas() {
    // "Background" - extra space not filled with canvas
    this.displayCtx.fillStyle = window.getComputedStyle(document.documentElement).getPropertyValue("--background-1-colour");
    this.displayCtx.fillRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
    
    const width = this.mixingCanvas.width * this.zoom;
    const height = this.mixingCanvas.height * this.zoom;
    // Show transparency pattern under image
    this.displayCtx.clearRect(this.pan.x, this.pan.y, width, height);
    // Actual image
    this.displayCtx.drawImage(this.mixingCanvas, this.pan.x, this.pan.y, width, height);
  },
  
  // Export canvas image
  export() {
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = Session.canvas.toDataURL("image/png");
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
    // Zoom canvas to fit in canvas area if it doesn't already
    this.zoomToWindow("fit", false);
    Session.ctx.fillStyle = Colour.BLANK;
    Session.ctx.fillRect(0, 0, Session.canvas.width, Session.canvas.height);
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
      x: ((mouse.x - this.displayCanvas.offsetLeft) / Canvas.zoom) | 0,
      y: ((mouse.y - this.displayCanvas.offsetTop) / Canvas.zoom) | 0
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
    const sessionCanvasCopy = this._copyCanvas(Session.canvas);
    const clientCanvasCopies = {};
    for (const [clientId, client] of Object.entries(clients)) {
      clientCanvasCopies[clientId] = this._copyCanvas(client.canvas);
    }
    var changed = false;
    if (options.width !== Session.canvas.width) {
      Client.canvas.width = options.width;
      Session.canvas.width = options.width;
      for (const client of Object.values(clients)) {
        client.canvas.width = options.width;
      }
      changed = true;
    }
    if (options.height !== Session.canvas.height) {
      Client.canvas.height = options.height;
      Session.canvas.height = options.height;
      for (const client of Object.values(clients)) {
        client.canvas.height = options.height;
      }
      changed = true;
    }
    if (changed) {
      if (options.colour) {
        Session.ctx.fillStyle = options.colour;
        Session.ctx.fillRect(0, 0, Session.canvas.width, Session.canvas.height);
        Session.ctx.clearRect(options.x, options.y, sessionCanvasCopy.width, sessionCanvasCopy.height);
      }
      // Canvas already filled with background colour
      Session.ctx.drawImage(sessionCanvasCopy, options.x, options.y);
      
      for (const [clientId, client] of Object.entries(clients)) {
        // Canvas already cleared from size change
        client.ctx.drawImage(clientCanvasCopies[clientId], options.x, options.y);
      }
    }
    Canvas.update();
    if (user) {
      ActionHistory.addToUndo({
        type: "resize-canvas",
        options: options
      });
    }
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
    Session.ctx.fillStyle = Colour.BLANK;
    Session.ctx.fillRect(0, 0, Session.canvas.width, Session.canvas.height);
    this.mixingCtx.fillStyle = Colour.BLANK;
    this.mixingCtx.fillRect(0, 0, this.mixingCanvas.width, this.mixingCanvas.height);
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
    Session.ctx.clearRect(0, 0, Session.canvas.width, Session.canvas.height);
    this.mixingCtx.clearRect(0, 0, this.mixingCanvas.width, this.mixingCanvas.height);
    if (user) {
      ActionHistory.addToUndo({
        type: "clear"
      });
    }
  }
};
Canvas.mixingCtx = Canvas.mixingCanvas.getContext("2d");
