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
    thisCanvas.style.transform = "scale(0)";
    sessionCanvas.style.transform = "scale(0)";
    clientCanvasses.forEach((clientCanvas) => {
      clientCanvas.style.transform = "scale(0)";
    });
    
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
    thisCanvas.style.transform = `scale(${this.zoom})`;
    sessionCanvas.style.transform = `scale(${this.zoom})`;
    clientCanvasses.forEach((clientCanvas) => {
      clientCanvas.style.transform = `scale(${this.zoom})`;
    });
  },
  
  update(canvas, compOp = currentAction.data.compOp, save = false) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(sessionCanvas, 0, 0);
    this.ctx.globalCompositeOperation = COMP_OPS[compOp];
    this.ctx.drawImage(canvas, 0, 0);
    this.ctx.globalCompositeOperation = DEFAULT_COMP_OP;
    if (save) {
      sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      sessionCtx.drawImage(this.canvas, 0, 0);
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
    const file = new Blob([JSON.stringify({
      width: sessionCanvas.width,
      height: sessionCanvas.height,
      undoActions: ActionHistory.undoActions,
      redoActions: ActionHistory.redoActions
    })], { type: "application/json" });
    const url = URL.createObjectURL(file);
    a.href = url;
    a.download = "image.json";
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
    reader.onload = (event) => {
      Modal.open("retrieveModal");
      try {
        this.setup(JSON.parse(event.target.result));
      } catch (err) {
        console.error("Error setting up canvas: " + err);
        ActionHistory.clearUndo();
        ActionHistory.clearRedo();
        Modal.close("retrieveModal");
        Modal.open("oldCanvasFileModal");
      }
    };
    reader.readAsText(file);
  },
  
  setup(data) {
    sessionCanvas.width = data.width;
    sessionCanvas.height = data.height;
    thisCanvas.width = data.width;
    thisCanvas.height = data.height;
    clientCanvasses.forEach((clientCanvas) => {
      clientCanvas.width = data.width;
      clientCanvas.height = data.height;
    });
    if (data.strokes) {
      clientStrokes = new Map(Object.entries(data.strokes));
      clientStrokes.forEach((stroke, clientId) => {
        Pen.commitStroke(clientCanvasses.get(clientId), stroke, false);
      });
    }
    // Zoom canvas to fit in canvasContainer if it doesn't already
    this.zoomToWindow("fit", false);
    sessionCtx.fillStyle = BLANK_COLOUR;
    sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    ActionHistory.undoActions = data.undoActions;
    if (ActionHistory.undoActions.length) {
      ActionHistory.enableUndo();
    } else {
      ActionHistory.clearUndo();
    }
    ActionHistory.redoActions = data.redoActions;
    if (ActionHistory.redoActions.length) {
      ActionHistory.enableRedo();
    } else {
      ActionHistory.clearRedo();
    }
    for (var i = 0; i < ActionHistory.undoActions.length; i++) {
      ActionHistory.doAction(ActionHistory.undoActions[i]);
    }
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
  
  // Set the canvas size
  resize(width, height, bgColour) {
    function copyCanvas(canvas) {
      const newCanvas = document.createElement("canvas");
      newCanvas.width = canvas.width;
      newCanvas.height = canvas.height;
      newCanvas.getContext("2d").drawImage(canvas, 0, 0);
      return newCanvas;
    }
    
    const thisCanvasCopy = copyCanvas(thisCanvas);
    const sessionCanvasCopy = copyCanvas(sessionCanvas);
    const clientCanvasCopies = new Map;
    clientCanvasses.forEach((clientCanvas) => {
      clientCanvasCopies.set(clientCanvas, copyCanvas(clientCanvas));
    });
    var changed = false;
    if (width != sessionCanvas.width) {
      thisCanvas.width = width;
      sessionCanvas.width = width;
      clientCanvasses.forEach((clientCanvas) => {
        clientCanvas.width = width;
      });
      changed = true;
    }
    if (height != sessionCanvas.height) {
      thisCanvas.height = height;
      sessionCanvas.height = height;
      clientCanvasses.forEach((clientCanvas) => {
        clientCanvas.height = height;
      });
      changed = true;
    }
    if (changed) {
      sessionCtx.fillStyle = bgColour;
      sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      // Canvas already filled with background colour
      sessionCtx.drawImage(sessionCanvasCopy, 0, 0);
      
      // Canvas already cleared from size change
      thisCtx.drawImage(thisCanvasCopy, 0, 0);
      
      clientCanvasses.forEach((clientCanvas) => {
        const clientCtx = clientCanvas.getContext("2d");
        // Canvas already cleared from size change
        clientCtx.drawImage(clientCanvasCopies.get(clientCanvas), 0, 0);
      });
    }
  },
  
  // Import image and put on canvas
  importPicture(event) {
    const file = event.currentTarget.files[0];
    const reader = new FileReader();
    reader.onerror = (event) => {
      window.alert("There was an error reading the file.\n\n" + reader.error);
      console.error(`Error reading file ${file}:`, event);
    };
    reader.onload = (event) => {
      const img = new Image();
      img.addEventListener("load", () => {
        Client.sendMessage({
          type: "import-picture",
          image: img.src
        });
        sessionCtx.drawImage(img, 0, 0);
      });
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  },
  
  // Clear the (session) canvas to the blank colour
  clearBlank(user = true) {
    if (user) {
      Client.sendMessage({
        type: "clear-blank"
      });
    }
    sessionCtx.fillStyle = BLANK_COLOUR;
    sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    this.ctx.fillStyle = BLANK_COLOUR;
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
