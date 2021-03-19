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
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,
  
  DEFAULT_ZOOM: 1,
  MIN_ZOOM: 0,
  
  SCROLLBAR_WIDTH: 15,
  
  zoom: null,
  pan: {
    x: 0,
    y: 0
  },
  scrollbarX: {
    trough: null,
    thumb: null,
    drag: null
  },
  scrollbarY: {
    trough: null,
    thumb: null,
    drag: null
  },
  canvasArea: {
    width: 0,
    height: 0
  },
  
  container: document.getElementById("canvasContainer"),
  displayCanvas: document.getElementById("displayCanvas"),
  displayCtx: document.getElementById("displayCanvas").getContext("2d"),
  mixingCanvas: document.createElement("canvas"),
  mixingCtx: null,
  
  _transparentPattern: null,
  
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
      const pixelPan = {
        x: this.pan.x / this.zoom,
        y: this.pan.y / this.zoom
      };
      const oldPixelPos = this.getPixelPos(cachedMouseEvent, { floor: false });
      this.zoom += delta;
      const newPixelPos = this.getPixelPos(cachedMouseEvent, { floor: false });
      this.pan.x += (oldPixelPos.x - newPixelPos.x) * this.zoom;
      this.pan.y += (oldPixelPos.y - newPixelPos.y) * this.zoom;
      
      this.setZoom(this.zoom);
    }
  },
  // Set the canvas zoom with the number input
  setZoomValue(event) {
    this.setZoom(parseFloat(event.currentTarget.value) / 100, true);
  },
  // Set the canvas zoom to whatever fits in the canvas area, optionally only if it doesn't already fit
  zoomToWindow(type = "fit", allowLarger = true) {
    const widthZoom = this.canvasArea.width / Session.canvas.width;
    const heightZoom = this.canvasArea.height / Session.canvas.height;
    const fitZoom = type === "fit" ? Math.min(widthZoom, heightZoom) : Math.max(widthZoom, heightZoom);
    const newZoom = (fitZoom < this.zoom || allowLarger) ? fitZoom : this.zoom;
    this.setZoom(newZoom);
  },
  // Set the canvas zoom
  setZoom(zoom, keepCentre = false) {
    if (keepCentre) {
      const centre = {
        x: (this.canvasArea.width / 2) + this.pan.x,
        y: (this.canvasArea.height / 2) + this.pan.y
      };
      const oldCentre = {
        x: centre.x / this.zoom,
        y: centre.y / this.zoom
      };
      this.zoom = zoom;
      this.pan.x += (oldCentre.x - (centre.x / this.zoom)) * this.zoom;
      this.pan.y += (oldCentre.y - (centre.y / this.zoom)) * this.zoom;
    } else {
      this.zoom = zoom;
    }
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
      for (const clientId of Session.actionOrder) {
        const client = clients[clientId];
        // Selections are not part of the actual image
        // Type is only null when a selection is present but not currently being modified
        const type = client.action.type;
        if (type === null || type === Action.SELECTING || type === Action.SELECTION_MOVE || type === Action.SELECTION_RESIZE) {
          continue;
        }
        
        this.mixingCtx.globalCompositeOperation = COMP_OPS[client.action.data.compOp] || DEFAULT_COMP_OP;
        this.mixingCtx.drawImage(client.canvas, 0, 0);
      }
      for (const extra of extras) {
        this.mixingCtx.globalCompositeOperation = COMP_OPS[extra.compOp];
        this.mixingCtx.drawImage(extra.canvas, 0, 0);
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
    this.displayCtx.imageSmoothingEnabled = false;
    // "Background" - extra space not filled with canvas
    this.displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--background-1-colour");
    this.displayCtx.fillRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
    
    const width = Session.canvas.width * this.zoom;
    const height = Session.canvas.height * this.zoom;
    this.canvasArea = {
      width: this.displayCanvas.width - this.SCROLLBAR_WIDTH,
      height: this.displayCanvas.height - this.SCROLLBAR_WIDTH
    };
    
    // Ensure canvas is visible
    this.pan.x = minmax(this.pan.x, 0, width - this.canvasArea.width);
    this.pan.y = minmax(this.pan.y, 0, height - this.canvasArea.height);
    
    // Calculate scroll bar positions and dimensions
    this.scrollbarX.trough = {
      x: 0,
      y: this.displayCanvas.height - this.SCROLLBAR_WIDTH,
      width: this.canvasArea.width,
      height: this.SCROLLBAR_WIDTH
    };
    this.scrollbarX.thumb = {
      x: (this.pan.x / Session.canvas.width) * ((this.scrollbarX.trough.width - 2) / this.zoom) + 1,
      y: this.displayCanvas.height - this.SCROLLBAR_WIDTH + 1,
      width: Math.min((this.canvasArea.width / Session.canvas.width) * ((this.scrollbarX.trough.width - 2) / this.zoom), this.scrollbarX.trough.width - 2),
      height: this.SCROLLBAR_WIDTH - 2
    };
    this.scrollbarY.trough = {
      x: this.displayCanvas.width - this.SCROLLBAR_WIDTH,
      y: 0,
      width: this.SCROLLBAR_WIDTH,
      height: this.canvasArea.height
    };
    this.scrollbarY.thumb = {
      x: this.displayCanvas.width - this.SCROLLBAR_WIDTH + 1,
      y: (this.pan.y / Session.canvas.height) * ((this.scrollbarY.trough.height - 2) / this.zoom) + 1,
      width: this.SCROLLBAR_WIDTH - 2,
      height: Math.min((this.canvasArea.height / Session.canvas.height) * ((this.scrollbarY.trough.height - 2) / this.zoom), this.scrollbarY.trough.height - 2)
    };
    
    // Centre canvas in canvas area if smaller than it
    if (width < this.canvasArea.width) {
      this.pan.x = -((this.canvasArea.width - width) / 2);
      this.scrollbarX.thumb.x = 1;
      this.scrollbarX.thumb.width = this.scrollbarX.trough.width - 2;
    }
    if (height < this.canvasArea.height) {
      this.pan.y = -((this.canvasArea.height - height) / 2);
      this.scrollbarY.thumb.y = 1;
      this.scrollbarY.thumb.height = this.scrollbarY.trough.height - 2;
    }
    
    const imageRect = [-this.pan.x, -this.pan.y, width, height].map((x) => Math.round(x));
    // Show transparency pattern under image
    this.displayCtx.fillStyle = this._transparentPattern;
    this.displayCtx.translate(imageRect[0], imageRect[1]);
    this.displayCtx.fillRect(0, 0, imageRect[2], imageRect[3]);
    this.displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    // Actual image
    this.displayCtx.drawImage(this.mixingCanvas, ...imageRect);
    
    // Draw selections
    for (const clientId of Session.actionOrder) {
      const client = clients[clientId];
      const type = client.action.type;
      if (type !== null && type !== Action.SELECTING && type !== Action.SELECTION_MOVE && type !== Action.SELECTION_RESIZE) {
        continue;
      }
      SelectTool.draw(this.displayCtx, client.action.data, clientId === Client.id, clientId === Client.id, true);
    }
    
    // Border around image
    const imageBorderRect = [imageRect[0] + 0.5, imageRect[1] + 0.5, imageRect[2] - 1, imageRect[3] - 1];
    this.displayCtx.strokeStyle = "#ffff00";
    this.displayCtx.lineWidth = 1;
    this.displayCtx.setLineDash([5, 5]);
    this.displayCtx.lineDashOffset = 0.5;
    this.displayCtx.strokeRect(...imageBorderRect);
    this.displayCtx.strokeStyle = "#000000";
    this.displayCtx.lineDashOffset = 5.5;
    this.displayCtx.strokeRect(...imageBorderRect);
    this.displayCtx.setLineDash([]);
    
    // Draw scroll bars
    this.displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--scrollbar-trough-colour");
    this.displayCtx.fillRect(...Object.values(this.scrollbarX.trough));
    this.displayCtx.fillRect(...Object.values(this.scrollbarY.trough));
    
    this.displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--scrollbar-thumb-colour");
    this.displayCtx.fillRect(...Object.values(this.scrollbarX.thumb));
    this.displayCtx.fillRect(...Object.values(this.scrollbarY.thumb));
    
    this.displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--scrollbar-corner-colour");
    this.displayCtx.fillRect(this.scrollbarX.trough.width, this.scrollbarY.trough.height, this.SCROLLBAR_WIDTH, this.SCROLLBAR_WIDTH);
  },
  updateCanvasAreaSize() {
    this.displayCanvas.width = this.container.clientWidth;
    this.displayCanvas.height = this.container.clientHeight;
    this.drawCanvas();
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
    const file = new Blob([msgpack.encode([
      ActionHistory.actions,
      ActionHistory.pos
    ]).slice(1)], { type: "application/octet-stream" });
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
      
      const backupHistory = [
        ActionHistory.actions.slice(),
        ActionHistory.pos
      ];
      
      const data = new Uint8Array(reader.result);
      try {
        this.setup(msgpack.decode([0x92, ...data]));
        // Only send to other clients if setup was successful
        Client.sendMessage({
          type: Message.OPEN_CANVAS,
          file: data
        });
      } catch (err) {
        console.error("Error setting up canvas: " + err);
        ActionHistory.actions = backupHistory[0];
        ActionHistory.pos = backupHistory[1];
        ActionHistory.doAllActions();
        Modal.close("retrieveModal");
        Modal.open("oldCanvasFileModal");
      }
    };
    reader.readAsArrayBuffer(file);
  },
  
  setup([ history, pos, [ clientActions, actionOrder ] = [] ]) {
    this.init();
    // Zoom canvas to fit in canvas area if it doesn't already
    this.zoomToWindow("fit", false);
    ActionHistory.actions = history;
    ActionHistory.pos = pos;
    if (clientActions) {
      for (const [clientId, action] of Object.entries(clientActions)) {
        clients[clientId].action = action;
      }
      Session.actionOrder = actionOrder;
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
      x: (mouse.x - this.displayCanvas.offsetLeft),
      y: (mouse.y - this.displayCanvas.offsetTop)
    };
  },
  // Get the pixel position of the cursor on the canvas
  getPixelPos(event, { floor = true, round = false } = {}) {
    var mouse = this.getCursorPos(event);
    mouse = {
      x: (mouse.x + this.pan.x) / this.zoom,
      y: (mouse.y + this.pan.y) / this.zoom
    };
    if (round) {
      mouse.x = Math.round(mouse.x);
      mouse.y = Math.round(mouse.y);
    } else if (floor) {
      mouse.x |= 0;
      mouse.y |= 0;
    }
    return mouse;
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
    this.update();
    if (user) {
      ActionHistory.addToUndo(PastAction.RESIZE_CANVAS, options);
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
    reader.onload = () => SelectTool.importPicture(reader.result, Client.id);
    reader.readAsDataURL(file);
  },
  
  // Clear the (session) canvas to the blank colour
  clearBlank(user = true) {
    if (user) {
      Client.sendMessage({
        type: Message.CLEAR_BLANK
      });
    }
    Session.ctx.fillStyle = Colour.BLANK;
    Session.ctx.fillRect(0, 0, Session.canvas.width, Session.canvas.height);
    this.update();
    if (user) {
      ActionHistory.addToUndo(PastAction.CLEAR_BLANK);
    }
  },
  
  // Completely clear the (session) canvas
  clear(user = true) {
    if (user) {
      Client.sendMessage({
        type: Message.CLEAR
      });
    }
    Session.ctx.clearRect(0, 0, Session.canvas.width, Session.canvas.height);
    this.update();
    if (user) {
      ActionHistory.addToUndo(PastAction.CLEAR);
    }
  }
};
Canvas.mixingCtx = Canvas.mixingCanvas.getContext("2d");

const transparentImg = new Image();
transparentImg.addEventListener("load", () => {
  Canvas._transparentPattern = Canvas.displayCtx.createPattern(transparentImg, "repeat");
});
transparentImg.src = Images.TRANSPARENT;
