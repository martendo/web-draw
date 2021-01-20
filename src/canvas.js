const Canvas = {
  // Starting canvas dimensions
  CANVAS_WIDTH:  800,
  CANVAS_HEIGHT: 600,
  
  DEFAULT_ZOOM: 1,
  MIN_ZOOM:     0,
  
  zoom: null,
  
  container: document.getElementById("canvasContainer"),
  
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
    thisCanvas.style.transform = `scale(${this.zoom})`;
    sessionCanvas.style.transform = `scale(${this.zoom})`;
    clientCanvasses.forEach((clientCanvas) => {
      clientCanvas.style.transform = `scale(${this.zoom})`;
    });
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
    reader.onerror = () => {
      window.alert("There was an error reading the file.");
    };
    reader.onload = (event) => {
      Modal.open("retrieveModal");
      try {
        this.setup(JSON.parse(event.target.result));
      } catch (err) {
        console.log("Error setting up canvas: " + err);
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
  }
};

function openCanvas() {
  const filePicker = document.getElementById("chooseCanvasFile");
  filePicker.click();
}

// Set up the modal to resize the canvas
function chooseCanvasSize() {
  document.getElementById("canvasResizeWidth").value = sessionCanvas.width;
  document.getElementById("canvasResizeHeight").value = sessionCanvas.height;
  Modal.open("canvasResizeModal");
}
// Set the canvas size
function resizeCanvas() {
  Modal.close("canvasResizeModal");
  const width = document.getElementById("canvasResizeWidth").value;
  const height = document.getElementById("canvasResizeHeight").value;
  sendMessage({
    type: "resize-canvas",
    width: width,
    height: height,
    colour: penColours[1]
  });
  const thisCanvasImage = thisCanvas.toDataURL("image/png");
  const sessionCanvasImage = sessionCanvas.toDataURL("image/png");
  const clientCanvasImages = new Map;
  clientCanvasses.forEach((clientCanvas) => {
    clientCanvasImages.set(clientCanvas, clientCanvas.toDataURL("image/png"));
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
    const thisImg = new Image();
    thisImg.addEventListener("load", () => {
      // Canvas already cleared from size change
      thisCtx.drawImage(thisImg, 0, 0);
    });
    thisImg.src = thisCanvasImage;
    
    sessionCtx.fillStyle = penColours[1];
    sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    const sessionImg = new Image();
    sessionImg.addEventListener("load", () => {
      // Canvas already filled with background colour
      sessionCtx.drawImage(sessionImg, 0, 0);
    });
    sessionImg.src = sessionCanvasImage;
    
    clientCanvasses.forEach((clientCanvas) => {
      const clientCtx = clientCanvas.getContext("2d");
      const clientImg = new Image();
      clientImg.addEventListener("load", () => {
      // Canvas already cleared from size change
        clientCtx.drawImage(thisImg, 0, 0);
      });
      clientImg.src = clientCanvasImages.get(clientCanvas);
    });
  }
}
// Set the canvas image
function setCanvas(width, height, image, bgColour) {
  const thisCanvasImage = thisCanvas.toDataURL("image/png");
  const clientCanvasImages = new Map;
  clientCanvasses.forEach((clientCanvas) => {
    clientCanvasImages.set(clientCanvas, clientCanvas.toDataURL("image/png"));
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
    const thisImg = new Image();
    thisImg.addEventListener("load", () => {
      thisCtx.drawImage(thisImg, 0, 0);
    });
    thisImg.src = thisCanvasImage;
    
    clientCanvasses.forEach((clientCanvas) => {
      const clientCtx = clientCanvas.getContext("2d");
      const clientImg = new Image();
      clientImg.addEventListener("load", () => {
        clientCtx.drawImage(thisImg, 0, 0);
      });
      clientImg.src = clientCanvasImages.get(clientCanvas);
    });
  }
  
  const img = new Image();
  img.addEventListener("load", () => {
    if (changed) {
      sessionCtx.fillStyle = bgColour;
      sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    } else {
      sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
    }
    sessionCtx.drawImage(img, 0, 0);
  });
  img.src = image;
}

// Completely clear the (session) canvas
function clearCanvas(user = true) {
  if (user) {
    sendMessage({
      type: "clear"
    });
  }
  sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
  if (user) {
    ActionHistory.addToUndo({
      type: "clear"
    });
  }
}
// Clear the (Session) canvas to the blank colour
function clearCanvasBlank(user = true) {
  if (user) {
    sendMessage({
      type: "clear-blank"
    });
  }
  sessionCtx.fillStyle = BLANK_COLOUR;
  sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
  if (user) {
    ActionHistory.addToUndo({
      type: "clear-blank"
    });
  }
}

// Set up modal to import image
function selectImport() {
  const filePicker = document.getElementById("choosePicture");
  filePicker.click();
}
// Import image and put on canvas
function importPicture(event) {
  const file = event.currentTarget.files[0];
  const reader = new FileReader();
  reader.onerror = () => {
    window.alert("There was an error reading the file.");
  };
  reader.onload = (event) => {
    const img = new Image();
    img.addEventListener("load", () => {
      sendMessage({
        type: "import-picture",
        image: img.src
      });
      sessionCtx.drawImage(img, 0, 0);
    });
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}
