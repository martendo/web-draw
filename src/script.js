//------------------------------------------------------------------------------
// Web Draw
// A little real-time online drawing program.
//------------------------------------------------------------------------------

"use strict";

// Immediately Invoked Function Expression
(() => {

// The URL of the WebSockets server
const WSS_URL = "wss://web-draw.herokuapp.com";

// Send mouse movement update to server (if mouse has moved since last update) every X ms.
const MOUSEMOVE_UPDATE_INTERVAL = 50;

// WebSocket closure code descriptions
const CLOSE_CODES = {
  1000: "Normal Closure",
  1001: "Going Away",
  1002: "Protocol Error",
  1003: "Unsupported Data",
  1004: "No current meaning",
  1005: "No Status Received",
  1006: "Abnormal Closure",
  1007: "Invalid frame payload data",
  1008: "Policy Violation",
  1009: "Message too big",
  1010: "Missing Extension",
  1011: "Internal Error",
  1012: "Service Restart",
  1013: "Try Again Later",
  1014: "Bad Gateway",
  1015: "TLS Handshake"
};

var ctrlKey = false;

// Pen stroke cap and join options (used with value from selects)
const CAPS = ["round", "butt", "square"];

// Canvas globalCompositeOperation options
const COMP_OPS = [
  "source-over",
  "destination-over",
  "destination-out",
  "lighten",
  "screen",
  "color-dodge",
  "lighter",
  "darken",
  "color-burn",
  "multiply",
  "overlay",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "source-in",
  "source-out",
  "source-atop",
  "destination-in",
  "destination-atop",
  "xor",
  "copy",
  "hue",
  "saturation",
  "color",
  "luminosity"
];
const DEFAULT_COMP_OP = COMP_OPS[0];

// Starting pen colours
const START_COLOURS = ["#000000", "#ffffff"];
// Blank canvas colour
const BLANK_COLOUR = "#ffffff";

// Basic colours for quick selection
// Stolen from MS Paint
const BASIC_COLOURS = {
  values: [
    [
      "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27",
      "#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4"
    ],
    [
      "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e",
      "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7"
    ]
  ],
  names: [
    [
      "Black", "Grey-50%", "Dark red", "Red", "Orange",
      "Yellow", "Green", "Turquoise", "Indigo", "Purple"
    ],
    [
      "White", "Grey-25%", "Brown", "Rose", "Gold",
      "Light yellow", "Lime", "Light turquoise", "Blue-grey", "Lavender"
    ]
  ]
};

// Tools available to the user
const PEN_TOOL = 0, FILL_TOOL = 1, COLOUR_PICKER_TOOL = 2, RECT_SELECT_TOOL = 3,
      LINE_TOOL = 4, RECT_TOOL = 5, ELLIPSE_TOOL = 6;
const TOOLS = ["pen", "fill", "colourPicker", "select", "line", "rect", "ellipse"];
const NUM_TOOLS = TOOLS.length;

// All the slider inputs to set up
const TOOL_SETTINGS_SLIDERS = [
  { id: "penWidth", defaultVal: 10 },
  { id: "opacity", defaultVal: 100 },
  { id: "fillThreshold", defaultVal: 15 }
];

// List of ping latency measurements to calculate average
var prevPings = [];

const NO_ACTION = {
  type: null,
  data: null
};

// Drawing and tool variables
var currentAction = NO_ACTION, penColours = START_COLOURS.slice();
var currentPen = 0;
var tool = PEN_TOOL;

var clients = new Map;

var clientSelections = new Map;

// Whether mouse has moved or not since last update was sent to server
var mouseMoved = {
  moved: false,
  outside: false
};
// Most recent custom colours
var customColours = [];

// Current strokes of other clients in the session
var clientStrokes = new Map;

// Temporary canvasses for all other clients in the session
const clientCanvasses = new Map;
// Session canvas (permanent)
const sessionCanvas = document.getElementById("sessionCanvas");
const sessionCtx = sessionCanvas.getContext("2d");
// User's temporary canvas
const thisCanvas = document.getElementById("thisCanvas");
const thisCtx = thisCanvas.getContext("2d");

// Keep user's client ID
var thisClientId = null;

// Check if a point is within an area
function isPointInside(x, y, rect) {
  return (rect.x < x && x < rect.x + rect.width &&
          rect.y < y && y < rect.y + rect.height);
}

// Send a message to the server
function sendMessage(data) {
  const msg = JSON.stringify(data);
  socket.send(msg);
}

const Modal = {
  // Current modal z-index - newest modal should always show up at the top
  index: 99,
  
  open(id) {
    const modal = document.getElementById(id);
    // `grid` centres content without translate but others don't...
    modal.style.display = "grid";
    modal.style.zIndex = ++this.index;
  },
  close(id) {
    document.getElementById(id).style.display = "none";
    const modals = document.getElementsByClassName("modal");
    for (var i = 0; i < modals.length; i++) {
      const modal = modals[i];
      if (modal.style.display !== "none" && modal.style.display !== "") return;
    }
    this.index = 99;
  }
};

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

function updateColourValueAlpha(value) {
  for (var i = 0; i < 2; i++) {
    const colourValue = document.getElementById(`penColour${i}Value`);
    colourValue.value = colourValue.value.slice(0, -2) + ("0" + Math.round(value / 100 * 255).toString(16)).slice(-2);
    document.getElementById("penColour" + i).style.backgroundColor = colourValue.value;
  }
}

const Slider = {
  current: null,
  
  // Callback functions
  CALLBACKS: {
    "updateColourValueAlpha": updateColourValueAlpha
  },
  
  update(event) {
    if (!this.current) return;
    const input = document.getElementById(this.current + "Input");
    const rect = input.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    var fraction = dx / rect.width;
    const min = parseFloat(input.dataset.min);
    const value = Math.min(Math.max((fraction * (input.dataset.width - min)) + min, min), input.dataset.max);
    this.setValue(this.current, value);
  },
  setValue(id, value, doCallback = true) {
    const input = document.getElementById(id + "Input");
    value = value.toFixed(input.dataset.dplaces);
    input.dataset.value = value;
    document.getElementById(id + "Value").textContent = value;
    const min = parseFloat(input.dataset.min);
    document.getElementById(id + "Bar").style.width = Math.max(Math.min((value - min) / (parseFloat(input.dataset.width) - min) * 100, 100), 0) + "%";
    if (input.dataset.callback && doCallback) this.CALLBACKS[input.dataset.callback](value);
  },
  doArrow(id, dir) {
    const slider = document.getElementById(id + "Input");
    const newVal = Math.min(Math.max(parseFloat(slider.dataset.value) + (dir === "up" ? 1 : -1), slider.dataset.min), slider.dataset.max);
    this.setValue(id, newVal);
  }
};

const Colour = {
  // Convert hex colour value to an RGBA array
  hexToRgb(colour, alpha = 255) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colour);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
      alpha
    ] : null;
  },
  rgbToHex(colour) {
    return "#" + ("00000" + ((colour[0] << 16) + (colour[1] << 8) + colour[2]).toString(16)).substr(-6);
  }
};

const Pen = {
  // Add a point to the current stroke and draw it
  draw(x, y) {
    if (currentAction.type !== "stroke") return false;
    const lastPoint = currentAction.data.points[currentAction.data.points.length - 1];
    if (currentAction.data.points.length > 0 && x === lastPoint[0] && y === lastPoint[1]) return;
    sendMessage({
      type: "add-stroke",
      clientId: thisClientId,
      pos: [x, y]
    });
    currentAction.data.points.push([x, y]);
    this.drawStroke(thisCtx, currentAction.data);
  },
  // Add a point to another client's current stroke and draw it
  drawClientStroke(clientId) {
    const ctx = clientCanvasses.get(clientId).getContext("2d");
    const stroke = clientStrokes.get(clientId);
    this.drawStroke(ctx, stroke);
  },
  // Commit a stroke to the session canvas (copy it then erase it)
  commitStroke(srcCanvas, stroke, user = true) {
    this.drawStroke(sessionCtx, stroke, false);
    srcCanvas.getContext("2d").clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    if (user) {
      ActionHistory.addToUndo({
        type: "stroke",
        stroke: {...stroke}
      });
    }
  },
  
  // Draw a full stroke
  drawStroke(ctx, stroke, user = true) {
    if (user) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    var p0 = stroke.points[0],
        p1 = stroke.points[1];
    
    ctx.strokeStyle = stroke.colour;
    ctx.lineCap = CAPS[stroke.caps];
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.opacity;
    ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[stroke.compOp];
    
    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
    
    for (var i = 0; i < stroke.points.length - 1; i++) {
      const p0 = stroke.points[i], p1 = stroke.points[i + 1];
      const midPoint = [
        (p0[0] + p1[0]) / 2,
        (p0[1] + p1[1]) / 2
      ];
      ctx.quadraticCurveTo(p0[0], p0[1], midPoint[0], midPoint[1]);
    }
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
    ctx.stroke();
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
  }
};

const Fill = {
  // Determine whether a colour is within the flood fill threshold
  checkPixel(pixels, offset, colour, threshold, fillBy) {
    switch (fillBy) {
      // RGBA
      case 0: {
        for (var i = 0; i < 4; i++) {
          if (Math.abs(pixels[offset + i] - colour[i]) > threshold) return false;
        }
        break;
      }
      // RGB
      case 1: {
        for (var i = 0; i < 3; i++) {
          if (Math.abs(pixels[offset + i] - colour[i]) > threshold) return false;
        }
        break;
      }
      // Red
      case 2: {
        if (Math.abs(pixels[offset] - colour[0]) > threshold) return false;
        break;
      }
      // Green
      case 3: {
        if (Math.abs(pixels[offset + 1] - colour[1]) > threshold) return false;
        break;
      }
      // Blue
      case 4: {
        if (Math.abs(pixels[offset + 2] - colour[2]) > threshold) return false;
        break;
      }
      // Alpha
      case 5: {
        if (Math.abs(pixels[offset + 3] - colour[3]) > threshold) return false;
        break;
      }
    }
    return true;
  },
  // Fill an area of the same colour
  fill(startX, startY, colour, threshold, opacity, compOp, fillBy, changeAlpha, user = true) {
    const fillColour = Colour.hexToRgb(colour, 255 * opacity);
    const canvasWidth = sessionCanvas.width, canvasHeight = sessionCanvas.height;
    var pixelStack = [[startX, startY]],
        pixels = sessionCtx.getImageData(0, 0, canvasWidth, canvasHeight).data,
        pixelPos = ((startY * canvasWidth) + startX) * 4;
    const fillCtx = document.createElement("canvas").getContext("2d");
    fillCtx.canvas.width = canvasWidth;
    fillCtx.canvas.height = canvasHeight;
    var fillData = fillCtx.getImageData(0, 0, canvasWidth, canvasHeight),
        fillPixels = fillData.data;
    const originalColour = [
      pixels[pixelPos],
      pixels[pixelPos + 1],
      pixels[pixelPos + 2],
      pixels[pixelPos + 3]
    ];
    const seen = new Array(pixels.length).fill(false);
    while(pixelStack.length > 0) {
      var newPos, x, y, reachLeft, reachRight;
      newPos = pixelStack.pop();
      x = newPos[0];
      y = newPos[1];
      pixelPos = ((y * canvasWidth) + x) * 4;
      while(y-- >= 0 && this.checkPixel(pixels, pixelPos, originalColour, threshold, fillBy)) {
        pixelPos -= canvasWidth * 4;
      }
      pixelPos += canvasWidth * 4;
      y++;
      var reachLeft = reachRight = false;
      while(y++ < canvasHeight - 1 && this.checkPixel(pixels, pixelPos, originalColour, threshold, fillBy)) {
        for (var i = 0; i < 3; i++) {
          fillPixels[pixelPos + i] = pixels[pixelPos + i] - ((pixels[pixelPos + i] - fillColour[i]) * opacity);
        }
        if (changeAlpha) {
          fillPixels[pixelPos + 3] = Math.min(pixels[pixelPos + 3] + fillColour[3], 255);
        } else {
          fillPixels[pixelPos + 3] = pixels[pixelPos + 3];
        }
        seen[pixelPos] = true;
        if (x > 0 && !seen[pixelPos - 4]) {
          if (this.checkPixel(pixels, pixelPos - 4, originalColour, threshold, fillBy)) {
            if (!reachLeft) {
              pixelStack.push([x - 1, y]);
              reachLeft = true;
            }
          } else if (reachLeft) {
            reachLeft = false;
          }
        }
        if (x < canvasWidth - 1 && !seen[pixelPos + 4]) {
          if (this.checkPixel(pixels, pixelPos + 4, originalColour, threshold, fillBy)) {
            if (!reachRight) {
              pixelStack.push([x + 1, y]);
              reachRight = true;
            }
          } else if (reachRight) {
            reachRight = false;
          }
        }
        pixelPos += canvasWidth * 4;
      }
    }
    fillCtx.putImageData(fillData, 0, 0);
    sessionCtx.globalCompositeOperation = COMP_OPS[compOp];
    sessionCtx.drawImage(fillCtx.canvas, 0, 0);
    sessionCtx.globalCompositeOperation = DEFAULT_COMP_OP;
    if (user) {
      ActionHistory.addToUndo({
        type: "fill",
        x: startX,
        y: startY,
        colour: colour,
        threshold: threshold,
        opacity: opacity,
        compOp: compOp,
        fillBy: fillBy,
        changeAlpha: changeAlpha
      });
    }
  }
};

const Selection = {
  // Selection constants & variables
  HANDLE_SIZE: 5,
  HANDLE_GRAB_SIZE: 15,
  
  getResizeHandle(point, handles) {
    if (!currentAction.data.selected) return false;
    var handle = null;
    if (isPointInside(point.x, point.y, {
      x: currentAction.data.x - (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[0];
    } else if (isPointInside(point.x, point.y, {
      x: currentAction.data.x + (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y - (this.HANDLE_GRAB_SIZE / 2),
      width: currentAction.data.width - this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[1];
    } else if (isPointInside(point.x, point.y, {
      x: currentAction.data.x + currentAction.data.width - (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[2];
    } else if (isPointInside(point.x, point.y, {
      x: currentAction.data.x - (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y + (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: currentAction.data.height - this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[3];
    } else if (isPointInside(point.x, point.y, {
      x: currentAction.data.x + currentAction.data.width - (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y + (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: currentAction.data.height - this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[4];
    } else if (isPointInside(point.x, point.y, {
      x: currentAction.data.x - (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y + currentAction.data.height - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[5];
    } else if (isPointInside(point.x, point.y, {
      x: currentAction.data.x + (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y + currentAction.data.height - (this.HANDLE_GRAB_SIZE / 2),
      width: currentAction.data.width - this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[6];
    } else if (isPointInside(point.x, point.y, {
      x: currentAction.data.x + currentAction.data.width - (this.HANDLE_GRAB_SIZE / 2),
      y: currentAction.data.y + currentAction.data.height - (this.HANDLE_GRAB_SIZE / 2),
      width: this.HANDLE_GRAB_SIZE,
      height: this.HANDLE_GRAB_SIZE
    })) {
      handle = handles[7];
    }
    return handle;
  },
  draw(ctx, sel, handles, drawOld = true) {
    ctx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
    
    // Previously selected area
    if (sel.old && drawOld) {
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.lineDashOffset = 0;
      ctx.strokeRect(sel.old.x + 0.5, sel.old.y + 0.5, sel.old.width, sel.old.height);
      ctx.strokeStyle = "#ffffff";
      ctx.lineDashOffset = 2;
      ctx.strokeRect(sel.old.x + 0.5, sel.old.y + 0.5, sel.old.width, sel.old.height);
    }
    
    // Selected image data
    if (sel.data) this.drawData(ctx, sel);
    
    // Selection box
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = 0;
    ctx.strokeRect(sel.x + 0.5, sel.y + 0.5, sel.width, sel.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineDashOffset = 5;
    ctx.strokeRect(sel.x + 0.5, sel.y + 0.5, sel.width, sel.height);
    ctx.setLineDash([]);
    
    if (handles) {
      // Selection resize handles
      // 0-1-2
      // 3   4
      // 5-6-7
      
      // FILL
      ctx.fillStyle = "#ffffff";
      // Top left
      ctx.fillRect(sel.x - (this.HANDLE_SIZE / 2), sel.y - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top middle
      ctx.fillRect(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2), sel.y - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top right
      ctx.fillRect(sel.x + sel.width - (this.HANDLE_SIZE / 2), sel.y - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Left middle
      ctx.fillRect(sel.x - (this.HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Right middle
      ctx.fillRect(sel.x + sel.width - (this.HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom left
      ctx.fillRect(sel.x - (this.HANDLE_SIZE / 2), sel.y + sel.height - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom middle
      ctx.fillRect(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2), sel.y + sel.height - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom right
      ctx.fillRect(sel.x + sel.width - (this.HANDLE_SIZE / 2), sel.y + sel.height - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // STROKE
      ctx.strokeStyle = "#000000";
      // Top left
      ctx.strokeRect(sel.x - (this.HANDLE_SIZE / 2), sel.y - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top middle
      ctx.strokeRect(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2), sel.y - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Top right
      ctx.strokeRect(sel.x + sel.width - (this.HANDLE_SIZE / 2), sel.y - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Left middle
      ctx.strokeRect(sel.x - (this.HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Right middle
      ctx.strokeRect(sel.x + sel.width - (this.HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom left
      ctx.strokeRect(sel.x - (this.HANDLE_SIZE / 2), sel.y + sel.height - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom middle
      ctx.strokeRect(sel.x + (sel.width / 2) - (this.HANDLE_SIZE / 2), sel.y + sel.height - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
      // Bottom right
      ctx.strokeRect(sel.x + sel.width - (this.HANDLE_SIZE / 2), sel.y + sel.height - (this.HANDLE_SIZE / 2),
                       this.HANDLE_SIZE, this.HANDLE_SIZE);
    }
  },
  update(handles) {
    this.draw(thisCtx, currentAction.data, handles);
    
    // Pos & size
    document.getElementById("selectPos").textContent = `${currentAction.data.x}, ${currentAction.data.y}`;
    document.getElementById("selectSize").textContent = `${currentAction.data.width}x${currentAction.data.height}`;
    
    // Send to other clients (remove unnecessary info too)
    sendMessage({
      type: "selection-update",
      selection: {
        selected: currentAction.data.selected,
        x: currentAction.data.x,
        y: currentAction.data.y,
        width: currentAction.data.width,
        height: currentAction.data.height,
        flipped: currentAction.data.flipped
      },
      clientId: thisClientId
    });
  },
  drawData(ctx, sel) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = sel.data.width;
    tempCanvas.height = sel.data.height;
    tempCanvas.getContext("2d").putImageData(sel.data, 0, 0);
    ctx.translate(sel.flipped.x ? sel.width : 0, sel.flipped.y ? sel.height : 0);
    ctx.scale(sel.flipped.x ? -1 : 1, sel.flipped.y ? -1 : 1);
    const x = sel.x * (sel.flipped.x ? -1 : 1);
    const y = sel.y * (sel.flipped.y ? -1 : 1);
    ctx.drawImage(tempCanvas, x, y, sel.width, sel.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },
  cut(ctx, sel, colour) {
    this.copy(ctx, sel);
    this.clear(sel, colour);
  },
  copy(ctx, sel) {
    sel.data = sessionCtx.getImageData(sel.x, sel.y, sel.width, sel.height);
    this.draw(ctx, sel, true);
  },
  paste(sel, user = true) {
    if (sel.data) this.drawData(sessionCtx, sel);
    if (user) {
      ActionHistory.addToUndo({
        type: "selection-paste",
        selection: {
          x: sel.x,
          y: sel.y,
          width: sel.width,
          height: sel.height,
          flipped: sel.flipped,
          data: {
            data: [...sel.data.data],
            width: sel.data.width,
            height: sel.data.height
          }
        }
      });
    }
  },
  clear(sel, colour, user = true) {
    sessionCtx.fillStyle = colour;
    sessionCtx.fillRect(sel.x, sel.y, sel.width, sel.height);
    if (user) {
      ActionHistory.addToUndo({
        type: "selection-clear",
        selection: {
          x: sel.x,
          y: sel.y,
          width: sel.width,
          height: sel.height
        },
        colour: colour
      });
    }
  },
  doCopy() {
    if (!currentAction.data.selected) return;
    sendMessage({
      type: "selection-copy",
      clientId: thisClientId
    });
    this.copy(thisCtx, currentAction.data);
  },
  doCut() {
    if (!currentAction.data.selected) return;
    sendMessage({
      type: "selection-cut",
      colour: penColours[1],
      clientId: thisClientId
    });
    this.cut(thisCtx, currentAction.data, penColours[1]);
  },
  doPaste() {
    if (!currentAction.data.selected || !currentAction.data.data) return;
    sendMessage({
      type: "selection-paste",
      clientId: thisClientId
    });
    this.paste(currentAction.data);
  },
  remove() {
    sendMessage({
      type: "remove-selection",
      clientId: thisClientId
    });
    currentAction = NO_ACTION;
    thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
  },
  adjustSizeAbsolute() {
    if (currentAction.data.width < 0) {
      currentAction.data.x += currentAction.data.width;
      currentAction.data.width = Math.abs(currentAction.data.width);
      if (currentAction.data.data) currentAction.data.flipped.x = !currentAction.data.flipped.x;
      if (currentAction.type === "selection-resize") {
        switch (currentAction.data.resize.handle) {
          case 0: {
            currentAction.data.resize.handle = 2;
            break;
          }
          case 2: {
            currentAction.data.resize.handle = 0;
            break;
          }
          case 3: {
            currentAction.data.resize.handle = 4;
            break;
          }
          case 4: {
            currentAction.data.resize.handle = 3;
            break;
          }
          case 5: {
            currentAction.data.resize.handle = 7;
            break;
          }
          case 7: {
            currentAction.data.resize.handle = 5;
            break;
          }
        }
      }
    }
    if (currentAction.data.height < 0) {
      currentAction.data.y += currentAction.data.height;
      currentAction.data.height = Math.abs(currentAction.data.height);
      if (currentAction.data.data) currentAction.data.flipped.y = !currentAction.data.flipped.y;
      if (currentAction.type === "selection-resize") {
        switch (currentAction.data.resize.handle) {
          case 0: {
            currentAction.data.resize.handle = 5;
            break;
          }
          case 5: {
            currentAction.data.resize.handle = 0;
            break;
          }
          case 1: {
            currentAction.data.resize.handle = 6;
            break;
          }
          case 6: {
            currentAction.data.resize.handle = 1;
            break;
          }
          case 2: {
            currentAction.data.resize.handle = 7;
            break;
          }
          case 7: {
            currentAction.data.resize.handle = 2;
            break;
          }
        }
      }
    }
  }
};

const Line = {
  draw(line, ctx, user = true) {
    ctx.strokeStyle = line.colour;
    ctx.lineCap = CAPS[line.caps];
    ctx.lineWidth = line.width;
    ctx.globalAlpha = line.opacity;
    ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[line.compOp];
    
    ctx.beginPath();
    ctx.moveTo(line.x0, line.y0);
    ctx.lineTo(line.x1, line.y1);
    ctx.stroke();
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
  }
};

const Rect = {
  draw(rect, ctx, user = true) {
    const x = rect.lineWidth % 2 !== 0 ? rect.x + 0.5 : rect.x;
    const y = rect.lineWidth % 2 !== 0 ? rect.y + 0.5 : rect.y;
    
    ctx.globalAlpha = rect.opacity;
    ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[rect.compOp];
    
    if (rect.fill) {
      ctx.fillStyle = rect.colours.fill;
      ctx.fillRect(x, y, rect.width, rect.height);
    }
    if (rect.outline) {
      ctx.strokeStyle = rect.colours.outline;
      ctx.lineWidth = rect.lineWidth;
      ctx.strokeRect(x, y, rect.width, rect.height);
    }
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
  }
};

const Ellipse = {
  draw(ellipse, ctx, user = true) {
    const x = (ellipse.x + (ellipse.x + ellipse.width)) / 2;
    const y = (ellipse.y + (ellipse.y + ellipse.height)) / 2;
    const radiusX = Math.abs(x - ellipse.x);
    const radiusY = Math.abs(y - ellipse.y);
    
    ctx.globalAlpha = ellipse.opacity;
    ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[ellipse.compOp];
    
    if (ellipse.fill) {
      ctx.fillStyle = ellipse.colours.fill;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (ellipse.outline) {
      ctx.strokeStyle = ellipse.colours.outline;
      ctx.lineWidth = ellipse.lineWidth;
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
  }
};

// Get the position of the cursor
function getCursorPos(event) {
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
  return mouse;
}
// Get the position of the cursor relative to the canvas
function getRelCursorPos(event) {
  const mouse = getCursorPos(event);
  mouse.x += Canvas.container.scrollLeft;
  mouse.y += Canvas.container.scrollTop;
  return {
    x: ((mouse.x - (thisCanvas.offsetLeft + (thisCanvas.clientLeft * Canvas.zoom))) / Canvas.zoom) | 0,
    y: ((mouse.y - (thisCanvas.offsetTop + (thisCanvas.clientTop * Canvas.zoom))) / Canvas.zoom) | 0
  };
}

// Handle mousedown on canvas
function mouseHold(event) {
  if (event.target.id !== "thisCanvas") return;
  if (event.button) {
    switch (event.button) {
      case 0: {
        currentPen = 0;
        break;
      }
      case 2: {
        currentPen = 1;
        break;
      }
      default: return;
    }
  } else {
    currentPen = 0;
  }
  event.preventDefault();
  const point = getRelCursorPos(event);
  if (currentAction.data && currentAction.data.selected) {
    const handle = Selection.getResizeHandle(point, [0, 1, 2, 3, 4, 5, 6, 7]);
    if (handle !== null) {
      currentAction.data.resize = {
        handle: handle,
        x: point.x,
        y: point.y
      };
      currentAction.data.old = {
        x: currentAction.data.x,
        y: currentAction.data.y,
        width: currentAction.data.width,
        height: currentAction.data.height
      };
      currentAction.type = "selection-resize";
    } else if (isPointInside(point.x, point.y, currentAction.data)) {
      currentAction.data.move = {
        x: point.x,
        y: point.y
      };
      currentAction.type = "selection-move";
    } else {
      startTool(point);
    }
  } else {
    startTool(point);
  }
  return false;
}
function startTool(point) {
  currentAction.type = null;
  const opacityInput = document.getElementById("opacityInput");
  var opacity = parseFloat(opacityInput.dataset.value);
  opacity *= 0.01;
  if (tool !== RECT_SELECT_TOOL) Selection.remove();
  switch (tool) {
    case PEN_TOOL: {
      const size = parseInt(document.getElementById("penWidthInput").dataset.value, 10);
      currentAction = {
        type: "stroke",
        data: {
          points: [],
          colour: penColours[currentPen],
          size: size,
          caps: parseInt(document.getElementById("lineCapSelect").value),
          opacity: opacity,
          compOp: parseInt(document.getElementById("compositeSelect").value, 10)
        }
      };
      sendMessage({
        type: "start-stroke",
        clientId: thisClientId,
        data: currentAction.data
      });
      Pen.draw(point.x, point.y);
      break;
    }
    case FILL_TOOL: {
      const thresholdInput = document.getElementById("fillThresholdInput");
      var threshold = parseInt(thresholdInput.dataset.value, 10);
      const fillColour = penColours[currentPen];
      const compOp = parseInt(document.getElementById("compositeSelect").value, 10);
      const fillBy = parseInt(document.getElementById("fillBySelect").value, 10);
      const changeAlpha = document.getElementById("fillChangeAlpha").checked;
      sendMessage({
        type: "fill",
        x: point.x,
        y: point.y,
        colour: fillColour,
        threshold: threshold,
        opacity: opacity,
        compOp: compOp,
        fillBy: fillBy,
        changeAlpha: changeAlpha
      });
      Fill.fill(point.x, point.y, fillColour, threshold, opacity, compOp, fillBy, changeAlpha);
      break;
    }
    case COLOUR_PICKER_TOOL: {
      const pixelColour = sessionCtx.getImageData(point.x, point.y, 1, 1).data;
      const merge = document.getElementById("colourPickerMerge").checked;
      var colour = [0, 0, 0, 0];
      if (merge) {
        const penColour = Colour.hexToRgb(penColours[currentPen]);
        for (var i = 0; i < 3; i++) {
          colour[i] = Math.round((pixelColour[i] + penColour[i]) / 2);
        }
      } else {
        colour = pixelColour;
      }
      changeColour(Colour.rgbToHex(colour), currentPen);
      if (document.getElementById("colourPickerOpacity").checked) {
        var newOpacity = (pixelColour[3] / 255) * 100;
        if (merge) {
          newOpacity = (newOpacity + (opacity * 100)) / 2;
        }
        Slider.setValue("opacity", newOpacity);
      }
      break;
    }
    case RECT_SELECT_TOOL: {
      sendMessage({
        type: "create-selection",
        clientId: thisClientId
      });
      currentAction = {
        type: "selecting",
        data: {
          selected: false,
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          move: {},
          resize: {},
          flipped: {
            x: false,
            y: false
          }
        }
      };
      break;
    }
    case LINE_TOOL: {
      currentAction = {
        type: "line",
        data: {
          x0: point.x,
          y0: point.y,
          x1: point.x,
          y1: point.y,
          colour: penColours[currentPen],
          width: parseInt(document.getElementById("penWidthInput").dataset.value, 10),
          caps: parseInt(document.getElementById("lineCapSelect").value),
          opacity: opacity,
          compOp: parseInt(document.getElementById("compositeSelect").value, 10)
        }
      };
      break;
    }
    case RECT_TOOL: {
      currentAction = {
        type: "rect",
        data: {
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          colours: {
            outline: penColours[currentPen],
            fill: penColours[(currentPen + 1) % 2]
          },
          lineWidth: parseInt(document.getElementById("penWidthInput").dataset.value, 10),
          opacity: opacity,
          compOp: parseInt(document.getElementById("compositeSelect").value, 10),
          outline: document.getElementById("shapeOutline").checked,
          fill: document.getElementById("shapeFill").checked
        }
      };
      break;
    }
    case ELLIPSE_TOOL: {
      currentAction = {
        type: "ellipse",
        data: {
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          colours: {
            outline: penColours[currentPen],
            fill: penColours[(currentPen + 1) % 2]
          },
          lineWidth: parseInt(document.getElementById("penWidthInput").dataset.value, 10),
          opacity: opacity,
          compOp: parseInt(document.getElementById("compositeSelect").value, 10),
          outline: document.getElementById("shapeOutline").checked,
          fill: document.getElementById("shapeFill").checked
        }
      };
      break;
    }
  }
}
// Handle mousemove (prepare update and add point to stroke if drawing)
function mouseMove(event) {
  const point = getRelCursorPos(event);
  document.getElementById("cursorPos").textContent = `${point.x}, ${point.y}`;
  Slider.update(event);
  switch (currentAction.type) {
    case "stroke": {
      event.preventDefault();
      Pen.draw(point.x, point.y);
      break;
    }
    case "line": {
      event.preventDefault();
      currentAction.data.x1 = point.x, currentAction.data.y1 = point.y;
      sendMessage({
        type: "line",
        clientId: thisClientId,
        line: currentAction.data
      });
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      Line.draw(currentAction.data, thisCtx);
      break;
    }
    case "rect": {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      sendMessage({
        type: "rect",
        clientId: thisClientId,
        rect: currentAction.data
      });
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      Rect.draw(currentAction.data, thisCtx);
      break;
    }
    case "ellipse": {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      sendMessage({
        type: "ellipse",
        clientId: thisClientId,
        ellipse: currentAction.data
      });
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      Ellipse.draw(currentAction.data, thisCtx);
      break;
    }
    case "selecting": {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      Selection.update(false);
      break;
    }
    case "selection-move": {
      event.preventDefault();
      currentAction.data.x += point.x - currentAction.data.move.x;
      currentAction.data.y += point.y - currentAction.data.move.y;
      currentAction.data.move.x = point.x;
      currentAction.data.move.y = point.y;
      Selection.update(true);
      break;
    }
    case "selection-resize": {
      event.preventDefault();
      // 0-1-2
      // 3   4
      // 5-6-7
      var changeX = 0, changeY = 0, changeW = 0, changeH = 0;
      switch (currentAction.data.resize.handle) {
        case 0:{
          changeX = changeW = changeY = changeH = -1;
          break;
        }
        case 1: {
          changeY = changeH = -1;
          break;
        }
        case 2: {
          changeY = changeH = -1;
          changeW = 1;
          break;
        }
        case 3: {
          changeX = changeW = -1;
          break;
        }
        case 4: {
          changeW = 1;
          break;
        }
        case 5: {
          changeX = changeW = -1;
          changeH = 1;
          break;
        }
        case 6: {
          changeH = 1;
          break;
        }
        case 7: {
          changeH = changeW = 1;
          break;
        }
      }
      const dx = point.x - currentAction.data.resize.x;
      const dy = point.y - currentAction.data.resize.y;
      currentAction.data.width += dx * changeW;
      currentAction.data.x -= dx * changeX;
      currentAction.data.height += dy * changeH;
      currentAction.data.y -= dy * changeY;
      currentAction.data.resize.x = point.x;
      currentAction.data.resize.y = point.y;
      Selection.adjustSizeAbsolute();
      Selection.update(true);
      break;
    }
  }
  if (currentAction.data && currentAction.data.selected) {
    const cursor = Selection.getResizeHandle(point, [
      "nwse-resize", "ns-resize", "nesw-resize",
      "ew-resize",                "ew-resize",
      "nesw-resize", "ns-resize", "nwse-resize"
    ]);
    if (cursor !== null) {
      thisCanvas.style.cursor = cursor;
    } else if (isPointInside(point.x, point.y, currentAction.data)) {
      thisCanvas.style.cursor = "move";
    } else {
      thisCanvas.style.cursor = "auto";
    }
  } else {
    thisCanvas.style.cursor = "auto";
  }
  const mouse = getRelCursorPos(event);
  mouseMoved.moved = true;
  if (event.target.tagName != "CANVAS") {
    mouseMoved.x = -1;
  } else {
    mouseMoved.x = mouse.x;
    mouseMoved.y = mouse.y;
  }
}
// Handle mouseup
function clearMouseHold(event) {
  switch (currentAction.type) {
    case "stroke": {
      event.preventDefault();
      const point = getRelCursorPos(event);
      Pen.draw(point.x, point.y);
      sendMessage({
        type: "end-stroke",
        clientId: thisClientId
      });
      Pen.commitStroke(thisCanvas, currentAction.data);
      break;
    }
    case "line": {
      event.preventDefault();
      sendMessage({
        type: "commit-line",
        line: currentAction.data,
        clientId: thisClientId
      });
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      Line.draw(currentAction.data, sessionCtx, false);
      ActionHistory.addToUndo({
        type: "line",
        line: currentAction.data
      });
      break;
    }
    case "rect": {
      event.preventDefault();
      sendMessage({
        type: "commit-rect",
        rect: currentAction.data,
        clientId: thisClientId
      });
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      Rect.draw(currentAction.data, sessionCtx, false);
      ActionHistory.addToUndo({
        type: "rect",
        rect: currentAction.data
      });
      break;
    }
    case "ellipse": {
      event.preventDefault();
      sendMessage({
        type: "commit-ellipse",
        ellipse: currentAction.data,
        clientId: thisClientId
      });
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      Ellipse.draw(currentAction.data, sessionCtx, false);
      ActionHistory.addToUndo({
        type: "ellipse",
        ellipse: currentAction.data
      });
      break;
    }
    case "selecting": {
      event.preventDefault();
      if (currentAction.data.width && currentAction.data.height) {
        currentAction.data.selected = true;
        Selection.adjustSizeAbsolute();
        Selection.draw(thisCtx, currentAction.data, true);
      } else {
        Selection.remove();
      }
      break;
    }
    case "selection-move":
    case "selection-resize": {
      delete currentAction.data.old;
      Selection.draw(thisCtx, currentAction.data, true);
      event.preventDefault();
      break;
    }
  }
  Slider.current = null;
  currentAction.type = null;
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

// Open the colour picker
function selectColour(num) {
  const colourPicker = document.getElementById("colourPicker");
  const colourRect = document.getElementById("penColour" + num).getBoundingClientRect();
  colourPicker.style.left = colourRect.x + "px";
  colourPicker.style.top = (colourRect.y + colourRect.height) + "px";
  colourPicker.value = penColours[num];
  setTimeout(() => colourPicker.click(), 10);
}
// Set the pen colour
function changeColour(value, num, addCustom = true) {
  updateColour(value, num);
  penColours[num] = value;
  if (addCustom) {
    // Check if colour is one of the basic colours, if it is, don't add it to the custom colours
    for (var i = 0; i < BASIC_COLOURS.values.length; i++) {
      if (BASIC_COLOURS.values[i].includes(value)) return;
    }
    // Check if colour is already in custom colours, if it is, move to last (remove then push)
    const sameColourIndex = customColours.indexOf(value);
    if (sameColourIndex !== -1) customColours.splice(sameColourIndex, 1);
    customColours.push(value);
    const customColourBoxes = document.getElementById("customColourRow").children;
    if (customColours.length > customColourBoxes.length) customColours.shift();
    for (var i = 0; i < customColours.length; i++) {
      const colourBox = customColourBoxes[i];
      const col = customColours[i];
      colourBox.style.backgroundColor = col;
      colourBox.title = `${col}\nLeft or right click to set colour`;
      colourBox.onclick = (event) => setClickedPenColour(event, col);
      colourBox.oncontextmenu = (event) => setClickedPenColour(event, col);
    }
  }
}
// Update pen colour value and box, but don't set it
function updateColour(value, num) {
  const valueWithAlpha = value + ("0" + Math.round(parseFloat(document.getElementById("opacityInput").dataset.value, 10) / 100 * 255).toString(16)).slice(-2);
  document.getElementById("penColour" + num).style.backgroundColor = valueWithAlpha;
  const colourValue = document.getElementById(`penColour${num}Value`);
  colourValue.value = valueWithAlpha;
  colourValue.dataset.lastValue = value;
}
// Update pen colour value if value is a hex colour
function changeColourValue(event, num) {
  var value = event.currentTarget.value;
  const hex = /^#?([a-f\d]{6}|[a-f\d]{8}|[a-f\d]{3}|[a-f\d]{4})$/i.exec(value);
  if (hex) {
    var alpha;
    if (hex[1].length < 6) {
      const r = hex[1].slice(0, 1);
      const g = hex[1].slice(1, 2);
      const b = hex[1].slice(2, 3);
      value = r+r+g+g+b+b;
      if (hex[1].length === 4) {
        const a = hex[1].slice(3, 4);
        alpha = parseInt(a+a, 16);
      }
    }
    if (value.slice(0, 1) != "#") value = "#" + value;
    if (value.length > 6+1) {
      alpha = parseInt(value.slice(-2), 16);
      value = value.slice(0, -2);
    }
    if (typeof alpha !== "undefined") {
      const opacityInput = document.getElementById("opacityInput");
      const newOpacity = (alpha / 255) * 100;
      Slider.setValue("opacity", newOpacity);
    }
    changeColour(value, num);
  } else {
    updateColour(event.currentTarget.dataset.lastValue, num);
  }
}
// Set the pen colour for the button that was clicked
function setClickedPenColour(event, col) {
  var num;
  switch (event.button) {
    case 0: {
      num = 0;
      break;
    }
    case 2: {
      num = 1;
      break;
    }
    default: return false;
  }
  event.preventDefault();
  changeColour(col, num, false);
}

// Switch the current tool
function switchTool(newTool) {
  tool = newTool;
  for (var i = 0; i < NUM_TOOLS; i++) {
    document.getElementById(TOOLS[i] + "Btn").classList.remove("btnSelected");
    const settings = document.getElementsByClassName(TOOLS[i] + "Settings");
    if (settings) {
      for (var s = 0; s < settings.length; s++) {
        settings[s].classList.remove("currentToolSettings");
      }
    }
  }
  document.getElementById(TOOLS[tool] + "Btn").classList.add("btnSelected");
  const settings = document.getElementsByClassName(TOOLS[tool] + "Settings");
  if (settings) {
    for (var s = 0; s < settings.length; s++) {
      settings[s].classList.add("currentToolSettings");
    }
  }
  Selection.remove();
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
    sendMessage({
      type: "undo"
    });
    this.undo();
  },
  // Actually undo an action
  undo() {
    const previousAction = this.undoActions.pop();
    if (previousAction) {
      this.redoActions.push(previousAction);
      clearCanvasBlank(false);
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
    sendMessage({
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
        Pen.drawStroke(sessionCtx, action.stroke, false);
        break;
      }
      case "fill": {
        Fill.fill(action.x, action.y, action.colour, action.threshold, action.opacity, action.compOp, action.fillBy, action.changeAlpha, false);
        break;
      }
      case "clear": {
        sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
        break;
      }
      case "clear-blank": {
        sessionCtx.fillStyle = BLANK_COLOUR;
        sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
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
        Line.draw(action.line, sessionCtx, false);
        break;
      }
      case "rect": {
        Rect.draw(action.rect, sessionCtx, false);
        break;
      }
      case "ellipse": {
        Ellipse.draw(action.ellipse, sessionCtx, false);
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
  },
  clearRedo() {
    this.redoActions = [];
    this.redoBtn.disabled = true;
  }
};

// Copy text to the clipboard
function copyText(text, event = null) {
  navigator.clipboard.writeText(text, null, () => {
    console.log("navigator.clipboard.writeText failed");
    const textarea = document.createElement("textarea");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  });
  if (event) {
    const tooltip = document.getElementById("tooltip");
    tooltip.textContent = "Copied!";
    tooltip.style.left = (event.clientX + 20) + "px";
    tooltip.style.top = (event.clientY - 30) + "px";
    tooltip.style.visibility = "visible";
    setTimeout(() => {
      tooltip.style.visibility = "hidden";
    }, 1000);
  }
}

const Session = {
  id: null,
  password: null,
  link: location.origin,
  
  // Add/Remove a user canvas and mouse and update the total
  addUsers(c, total) {
    c.forEach((client) => {
      clients.set(client.id, client);
      if (client.id !== thisClientId) {
        const img = document.createElement("img");
        img.src = "/img/cursor.png";
        img.classList.add("cursorIcon");
        img.id = "cursorIcon-" + client.id;
        document.body.appendChild(img);
        const clientCanvas = document.createElement("canvas");
        clientCanvas.classList.add("clientCanvas");
        clientCanvas.id = "clientCanvas-" + client.id;
        clientCanvas.width = sessionCanvas.width;
        clientCanvas.height = sessionCanvas.height;
        clientCanvas.style.transform = `scale(${Canvas.zoom})`;
        Canvas.container.appendChild(clientCanvas);
        clientCanvasses.set(client.id, clientCanvas);
      }
    });
    this.updateUserInfo(total);
  },
  removeUsers(client, total) {
    clients.delete(client.id);
    if (client.id !== thisClientId) {
      const img = document.getElementById("cursorIcon-" + client.id);
      img.remove();
      document.getElementById("clientCanvas-" + client.id).remove();
      clientCanvasses.delete(client.id);
    }
    this.updateUserInfo(total);
  },
  // Update the total number of users connected to the current session
  updateUserInfo(num) {
    var isAre = "are", s = "s";
    if (num == 1) {
      isAre = "is";
      s = "";
    }
    document.getElementById("userBox").innerHTML = `There ${isAre} <a href="javascript:void(0)" id="userCount">${num} user${s}</a> connected to this session.`;
    document.getElementById("userCount").onclick = () => Modal.open("sessionInfoModal");
    
    document.getElementById("sessionInfoClients").textContent = num;
    this.updateClientTable();
  },
  
  updateClientTable() {
    const clientList = [...clients.values()];
    const table = document.getElementById("sessionInfoClientBody");
    for (var i = table.children.length - 1; i >= 0; i--) {
      table.removeChild(table.children[i]);
    }
    for (let i = 0; i < clients.size; i++) {
      const row = table.insertRow(-1),
            idCell = row.insertCell(0),
            nameCell = row.insertCell(1);
      idCell.textContent = clientList[i].id;
      nameCell.textContent = clientList[i].name;
      row.classList.add("sessionInfoClient");
      if (clientList[i].id === thisClientId) row.classList.add("sessionInfoThisClient");
      row.title = "Click to send private message";
      row.addEventListener("click", () => {
        Chat.box.classList.remove("displayNone");
        Chat.open();
        Chat.addMessageTo(clientList[i].id);
        Modal.close("sessionInfoModal");
      });
    }
  },
  
  // Request to create a new session
  create() {
    sendMessage({
      type: "create-session",
      id: document.getElementById("sessionIdInput").value
    });
  },
  // Request to join a session
  join() {
    sendMessage({
      type: "join-session",
      id: document.getElementById("sessionIdInput").value
    });
  },
  // Leave a session
  leave() {
    sendMessage({
      type: "leave-session"
    });
    
    document.getElementById("menuScreen").style.display = "grid";
    document.getElementById("drawScreen").style.display = "none";
    const cursors = document.getElementsByClassName("cursorIcon");
    for (var i = 0; i < cursors.length; i++) {
      cursors[i].remove();
    }
    window.history.replaceState({}, "Web Draw", "/");
    document.getElementById("sessionIdInfo").textContent = "N/A";
    
    this.id = null;
  },
  
  changeId() {
    sendMessage({
      type: "session-id",
      id: document.getElementById("sessionIdNew").value
    });
  },
  
  updateId(id) {
    this.id = id;
    window.history.replaceState({}, `${this.id} - Web Draw`, `/s/${encodeURIComponent(this.id)}`);
    document.getElementById("sessionId").textContent = this.id;
    document.getElementById("sessionIdInfo").textContent = this.id;
    document.getElementById("sessionIdCurrent").textContent = this.id;
    document.getElementById("sessionInfoId").textContent = this.id;
    this.updateLink();
  },
  
  updatePassword(password) {
    this.password = password;
    const text = document.getElementById("sessionPasswordCurrent");
    if (password === null) {
      text.textContent = "There is currently no password set on this session.";
    } else {
      text.innerHTML = `Current password: <span class="clickToCopy lightBox" title="Copy" id="currentPassword">${this.password}</span>`;
      const current = document.getElementById("currentPassword");
      current.onclick = (event) => copyText(current.textContent, event);
    }
    this.updateLink();
  },
  
  updateLink() {
    this.link = `${location.origin}/s/${encodeURIComponent(this.id)}`;
    const includePassword = document.getElementById("sessionLinkPassword");
    const includePasswordInput = document.getElementById("sessionLinkPasswordInput");
    if (this.password !== null) {
      if (includePasswordInput.checked) this.link += `?pass=${encodeURIComponent(this.password)}`;
      includePassword.style.display = "block";
    } else {
      includePassword.style.display = "none";
    }
    document.getElementById("sessionLink").textContent = this.link;
  },
  
  setPassword() {
    sendMessage({
      type: "session-password",
      password: document.getElementById("sessionPasswordNew").value
    });
  },
  
  enterPassword() {
    sendMessage({
      type: "enter-password",
      password: document.getElementById("enterSessionPassword").value,
      id: document.getElementById("enterSessionPasswordId").textContent
    });
  },
  
  saveUserSettings() {
    const name = document.getElementById("userNameInput").value;
    if (name !== clients.get(thisClientId).name) {
      sendMessage({
        type: "user-name",
        name: name,
        clientId: thisClientId
      });
      document.getElementById("userName").textContent = name;
    }
    Modal.close("userModal");
  }
};

function elementFitHeight(el) {
  el.style.height = 0;
  el.style.height = el.scrollHeight + "px";
}

const Chat = {
  box: document.getElementById("chatBox"),
  input: document.getElementById("chatInput"),
  
  send() {
    const msg = this.input.value;
    const indexSpace = msg.indexOf(" ");
    if (msg.trim() === "" || (msg.slice(0, 3) === "to:" && (msg.slice(indexSpace).trim() === "" || indexSpace === -1))) return;
    this.input.value = "";
    const box = document.getElementById("chatMessages");
    const isAtBottom = box.scrollTop == box.scrollHeight - box.clientHeight;
    elementFitHeight(this.input);
    if (isAtBottom) box.scrollTop = box.scrollHeight - box.clientHeight;
    sendMessage({
      type: "chat-message",
      message: msg,
      clientId: thisClientId
    });
  },
  
  getFullDate(date) {
    var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()],
        day = date.getDate(),
        year = date.getFullYear(),
        hours = date.getHours(),
        amPm = hours < 12 ? "AM" : "PM",
        minutes = ("0" + date.getMinutes()).substr(-2),
        seconds = ("0" + date.getSeconds()).substr(-2);
    hours %= 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds} ${amPm}`;
  },
  
  addMessageTo(id) {
    if (this.input.value.slice(0, 3) === "to:") {
      // "to:" at beginning of message, already has list
      const split = this.input.value.split(" ");
      // List of IDs already contains ID
      if (split[0].slice(3).split(",").includes(id)) return;
      const toLen = split[0].length;
      // Add to the existing list: A comma if there is already an ID in it, the new ID, space and the rest of the message
      this.input.value = this.input.value.slice(0, toLen) + (toLen === 3 ? "" : ",") + id + " " + (this.input.value.slice(toLen + 1) || "");
    } else {
      // Message doesn't have a "to:" list yet, add one;
      this.input.value = `to:${id} ` + (this.input.value.slice(0, 1) === " " ? this.input.value.slice(1) : this.input.value);
    }
    elementFitHeight(this.input);
    this.input.focus();
  },
  
  addMessage(msg) {
    // Replace characters that can interfere with HTML, and do markdown styling
    msg.message = msg.message
      .replaceAll("&", "&#38;")
      .replaceAll("<", "&#60;")
      .replaceAll(">", "&#62;")
      .replace(/(^|[^\\])((?:\\{2})*)\*\*([\s\S]*?[^\\](?:\\{2})*)\*\*/mg, "$1$2<strong>$3</strong>") // **bold**
      .replace(/(^|[^\\])((?:\\{2})*)__([\s\S]*?[^\\](?:\\{2})*)__/mg, "$1$2<u>$3</u>")               // __underlined__
      .replace(/(^|[^\\])((?:\\{2})*)~~([\s\S]*?[^\\](?:\\{2})*)~~/mg, "$1$2<s>$3</s>")               // ~~strikethrough~~
      .replace(/(^|[^\\*])((?:\\{2})*)\*([\s\S]*?[^\\*](?:\\{2})*)\*/mg, "$1$2<em>$3</em>")           // *italicized*
      .replace(/(^|[^\\_])((?:\\{2})*)_([\s\S]*?[^\\_](?:\\{2})*)_/mg, "$1$2<em>$3</em>")             // _italicized_
      .replace(/\\([\s\S])/mg, "$1")
      .replaceAll("\\", "&#92;");
    const client = clients.get(msg.clientId);
    const box = document.getElementById("chatMessages");
    var bubble;
    const last = box.children[box.children.length - 1];
    // Quirk that is actually wanted: When chatBox is not displayed, its dimensions are all 0, so isAtBottom is true
    // 14 = 8px padding, 1px border, 5px margin
    const isAtBottom = box.scrollHeight - box.clientHeight <= box.scrollTop + (last ? last.children[last.children.length - 1].getBoundingClientRect().height : 0) + 14;
    // Create new message bubble if last message was not from the same person or is not of the same type or it was 3 or more minutes ago
    if (!last || parseInt(last.children[last.children.length - 1].dataset.timestamp, 10) + 1000*60*3 <= msg.timestamp ||
      (msg.priv ? (!last.classList.contains("chatMessage-" + client.id) || !last.classList.contains("chatMessagePrivate-" + msg.priv))
                : (!last.classList.contains("chatMessage-" + client.id) || last.classList.contains("chatMessagePrivate")))) {
      bubble = document.createElement("div");
      bubble.classList.add("chatMessageBubble", "chatMessage-" + client.id);
      const nameRow = document.createElement("div");
      nameRow.classList.add("chatMessageNameRow");
      const name = document.createElement("a");
      name.classList.add("chatMessageName", "chatMessageName-" + client.id);
      name.textContent = client.name || client.id;
      name.title = client.id;
      name.href = "javascript:void(0)";
      name.addEventListener("click", () => this.addMessageTo(client.id));
      nameRow.appendChild(name);
      const time = document.createElement("span");
      time.classList.add("chatMessageTime");
      const timestamp = new Date(msg.timestamp);
      var hours = timestamp.getHours();
      const amPm = hours < 12 ? "AM" : "PM";
      hours %= 12;
      hours = hours ? hours : 12;
      time.textContent = `${hours}:${("0" + timestamp.getMinutes()).slice(-2)} ${amPm}`;
      time.title = this.getFullDate(timestamp);
      nameRow.appendChild(time);
      if (msg.priv) {
        bubble.classList.add("chatMessagePrivate", "chatMessagePrivate-" + msg.priv);
        const privateText = document.createElement("span");
        privateText.classList.add("chatPrivateText");
        privateText.textContent = "Private";
        this.writePrivateTextTitle(privateText, msg.priv);
        nameRow.appendChild(privateText);
      }
      bubble.appendChild(nameRow);
    } else {
      // Message is the same type as the last, just add to the bottom of the previous bubble
      bubble = document.getElementsByClassName("chatMessage-" + client.id);
      bubble = bubble[bubble.length - 1];
    }
    const msgText = document.createElement("div");
    msgText.classList.add("chatMessageText");
    msgText.dataset.timestamp = msg.timestamp;
    msgText.title = this.getFullDate(new Date(msg.timestamp));
    msgText.innerHTML = msg.message;
    bubble.appendChild(msgText);
    box.appendChild(bubble);
    
    if (msg.clientId !== thisClientId && box.parentElement.classList.contains("displayNone")) {
      // Add red dot to "Chat" button on menubar
      const chatNew = document.getElementById("chatNew");
      chatNew.style.width = "8px";
      chatNew.style.height = "8px";
      chatNew.style.top = "0";
      chatNew.style.right = "0";
    }
    
    // Scroll down to the bottom of the messages automatically if was already at bottom
    if (isAtBottom) {
      const tempClassName = this.box.className;
      this.box.classList.remove("displayNone");
      box.scrollTop = box.scrollHeight - box.clientHeight;
      this.box.className = tempClassName;
    }
  },
  
  writePrivateTextTitle(el, ids) {
    var title = "Only ";
    for (var i = 0; i < ids.length; i++) {
      var clientName = "Unknown";
      if (ids[i] === thisClientId) {
        clientName = "you";
      } else {
        const toClient = clients.get(ids[i]);
        clientName = (toClient.name || toClient.id);
      }
      title += clientName;
      if (i <= ids.length - 2 && ids.length === 2) {
        title += " ";
      } else if (i <= ids.length - 2) {
        title += ", ";
      }
      if (i === ids.length - 2) {
        title += "and ";
      }
      el.classList.add("chatPrivateText-" + ids[i]);
    }
    title += " can see this message.";
    el.title = title;
  },
  
  toggle() {
    if (!this.box.classList.toggle("displayNone")) this.open();
  },
  open() {
    const chatNew = document.getElementById("chatNew");
    chatNew.style.width = 0;
    chatNew.style.height = 0;
    chatNew.style.top = "4px";
    chatNew.style.right = "4px";
    this.input.focus();
  }
};

// Tell the user if their browser does not support WebSockets
if (!("WebSocket" in window)) Modal.open("noWsModal");

const waitConnect = () => {
  const wait = document.getElementById("connectionInfoWait");
  if (wait.textContent.length == 3) wait.textContent = "";
  wait.innerHTML += "&#183;";
};
const connectionWait = setInterval(() => waitConnect(), 500);
waitConnect();

const wakingUp = setTimeout(() => {
  const info = document.createElement("div");
  info.id = "wakingUpInfo";
  info.textContent = "You may be waking up the server. It goes to sleep after a bit of inactivity. Hang on tight!"
  document.getElementById("connectionInfo").appendChild(info);
}, 3000);

// Create WebSocket
const socket = new WebSocket(WSS_URL);

// Show error modal on error
socket.onerror = () => {
  Modal.open("errorModal");
  Session.leave();
};
socket.onopen = () => {
  document.getElementById("connectionInfo").style.display = "none";
  document.getElementById("connectionInfoWait").style.display = "none";
  document.getElementById("menuOptionsContainer").style.display = "block";
  clearInterval(connectionWait);
  clearTimeout(wakingUp);
  const info = document.getElementById("wakingUpInfo");
  if (info) info.remove();
  
  // Tell the server if there is a session ID in the URL
  const result = /^\/s\/(.+)$/.exec(location.pathname);
  if (result) {
    const pass = /[?&]pass=(.+?)(?:&|$)/.exec(location.search);
    sendMessage({
      type: "url-session",
      id: decodeURIComponent(result[1]),
      password: (pass ? decodeURIComponent(pass[1]) : null)
    });
  }
  // Remove session path in case session isn't joined (e.g. wrong password)
  window.history.replaceState({}, "Web Draw", "/");
  // Query string also removed
  
  // Send mouse movements if mouse has moved
  setInterval(() => {
    if (mouseMoved.moved) {
      const outside = mouseMoved.x < 0 || mouseMoved.x > sessionCanvas.width || mouseMoved.y < 0 || mouseMoved.y > sessionCanvas.height;
      if (outside && !mouseMoved.outside) {
        sendMessage({
          type: "mouse-move",
          outside: true,
          clientId: thisClientId
        });
        mouseMoved.outside = true;
      } else if (!outside) {
        sendMessage({
          type: "mouse-move",
          pos: [
            mouseMoved.x,
            mouseMoved.y
          ],
          clientId: thisClientId
        });
        mouseMoved.outside = false;
      }
      mouseMoved.moved = false;
    }
  }, MOUSEMOVE_UPDATE_INTERVAL);
};

// Tell the user when the socket has closed
socket.onclose = (event) => {
  Session.leave();
  const text = document.getElementById("disconnectText");
  text.innerHTML = `You were disconnected from the server.<br>Code: ${event.code} (${CLOSE_CODES[event.code]})`;
  if (event.reason) text.innerHTML += `<br>Reason: ${event.reason}`;
  const connectionInfo = document.getElementById("connectionInfo");
  clearInterval(connectionWait);
  clearTimeout(wakingUp);
  const info = document.getElementById("wakingUpInfo");
  if (info) info.remove();
  connectionInfo.innerHTML = "Disconnected from server. :(<br><br>";
  connectionInfo.className = "connectionInfoDisconnected";
  connectionInfo.style.display = "block";
  const reloadBtn = document.createElement("button");
  reloadBtn.textContent = "Reload";
  reloadBtn.addEventListener("click", () => location.reload());
  connectionInfo.appendChild(reloadBtn);
  document.getElementById("menuOptionsContainer").style.display = "none";
  Modal.open("disconnectModal");
};

// Handle messages from the server
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    // Connection to server established (and acknowledged) - set up client ID
    case "connection-established": {
      thisClientId = data.id;
      document.getElementById("clientIdInfo").textContent = thisClientId;
      document.getElementById("userName").textContent = thisClientId;
      break;
    }
    case "latency": {
      document.getElementById("pingInfo").textContent = data.latency + " ms";
      prevPings.push(data.latency);
      var average = 0;
      for (var i = 0; i < prevPings.length; i++) {
        average += prevPings[i];
      }
      average = parseFloat((average / prevPings.length).toFixed(1));
      document.getElementById("avgPingInfo").textContent = average + " ms";
      
      document.getElementById("minLatency").textContent = prevPings.reduce((a, b) => Math.min(a, b)) + " ms";
      document.getElementById("maxLatency").textContent = prevPings.reduce((a, b) => Math.max(a, b)) + " ms";
      document.getElementById("avgLatency").textContent = average + " ms";
      
      const pingTable = document.getElementById("pingTableBody");
      const row = pingTable.insertRow(-1);
      const numCell = row.insertCell(-1),
            latencyCell = row.insertCell(-1);
      numCell.textContent = prevPings.length;
      latencyCell.textContent = data.latency + " ms";
      
      break;
    }
    // Another user has started a stroke
    case "start-stroke": {
      clientStrokes.set(data.clientId, data.data);
      break;
    }
    // Another user has added a point in their current stroke
    case "add-stroke": {
      clientStrokes.get(data.clientId).points.push([data.pos[0], data.pos[1]]);
      Pen.drawClientStroke(data.clientId);
      break;
    }
    // Another user has ended their stroke
    case "end-stroke": {
      Pen.commitStroke(
        clientCanvasses.get(data.clientId),
        clientStrokes.get(data.clientId)
      );
      clientStrokes.delete(data.clientId);
      break;
    }
    // Another user has undone/redone an action
    case "undo": {
      ActionHistory.undo();
      break;
    }
    case "redo": {
      ActionHistory.redo();
      break;
    }
    // Another user has used the flood fill tool
    case "fill": {
      Fill.fill(data.x, data.y, data.colour, data.threshold, data.opacity, data.compOp, data.fillBy, data.changeAlpha);
      break;
    }
    // Another user has cleared the canvas
    case "clear": {
      sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      ActionHistory.addToUndo({
        type: "clear"
      });
      break;
    }
    case "clear-blank": {
      sessionCtx.fillStyle = BLANK_COLOUR;
      sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      ActionHistory.addToUndo({
        type: "clear-blank"
      });
      break;
    }
    // Another user has imported a picture onto the canvas
    case "import-picture": {
      const img = new Image();
      img.addEventListener("load", () => {
        sessionCtx.drawImage(img, 0, 0);
      });
      img.src = data.image;
      break;
    }
    case "create-selection": {
      clientSelections.set(data.clientId, {});
      break;
    }
    case "remove-selection": {
      clientSelections.delete(data.clientId);
      const canvas = clientCanvasses.get(data.clientId);
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      break;
    }
    // Another user has changed their selection
    case "selection-update": {
      const sel = clientSelections.get(data.clientId);
      sel.selected = data.selection.selected;
      sel.x = data.selection.x;
      sel.y = data.selection.y;
      sel.width = data.selection.width;
      sel.height = data.selection.height;
      sel.flipped = data.selection.flipped;
      Selection.draw(clientCanvasses.get(data.clientId).getContext("2d"), sel, false, false);
      break;
    }
    case "selection-copy": {
      Selection.copy(clientCanvasses.get(data.clientId).getContext("2d"), clientSelections.get(data.clientId));
      break;
    }
    case "selection-cut": {
      Selection.cut(clientCanvasses.get(data.clientId).getContext("2d"), clientSelections.get(data.clientId), data.colour);
      break;
    }
    case "selection-paste": {
      Selection.paste(clientSelections.get(data.clientId));
      break;
    }
    case "selection-clear": {
      Selection.clear(clientSelections.get(data.clientId), data.colour);
      break;
    }
    case "line": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      Line.draw(data.line, clientCtx);
      break;
    }
    case "commit-line": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      Line.draw(data.line, sessionCtx, false);
      ActionHistory.addToUndo({
        type: "line",
        line: data.line
      });
      break;
    }
    case "rect": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      Rect.draw(data.rect, clientCtx);
      break;
    }
    case "commit-rect": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      Rect.draw(data.rect, sessionCtx, false);
      ActionHistory.addToUndo({
        type: "rect",
        rect: data.rect
      });
      break;
    }
    case "ellipse": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      Ellipse.draw(data.ellipse, clientCtx);
      break;
    }
    case "commit-ellipse": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      Ellipse.draw(data.ellipse, sessionCtx, false);
      ActionHistory.addToUndo({
        type: "ellipse",
        ellipse: data.ellipse
      });
      break;
    }
    case "user-name": {
      clients.get(data.clientId).name = data.name;
      [...document.getElementsByClassName("chatMessageName-" + data.clientId)].forEach((name) => name.textContent = data.name);
      [...document.getElementsByClassName("chatPrivateText-" + data.clientId)].forEach((text) => {
        Chat.writePrivateTextTitle(text, [...text.className.matchAll(/chatPrivateText-([a-z\d]{4})/g)].map((name) => name[1]));
      })
      Session.updateClientTable();
      break;
    }
    case "chat-message": {
      Chat.addMessage(data);
      break;
    }
    // Another user has changed the canvas size
    case "resize-canvas": {
      const image = sessionCanvas.toDataURL("image/png");
      setCanvas(data.width, data.height, image, data.colour);
      break;
    }
    // The server needs a copy of the canvas to send to a new user
    case "request-canvas": {
      const sendClientStrokes = currentAction.type === "stroke"
        ? Object.fromEntries([...clientStrokes, [thisClientId, currentAction.data]])
        : Object.fromEntries([...clientStrokes]);
      sendMessage({
        type: "response-canvas",
        width: sessionCanvas.width,
        height: sessionCanvas.height,
        strokes: sendClientStrokes,
        undoActions: ActionHistory.undoActions,
        redoActions: ActionHistory.redoActions,
        clientId: data.clientId
      });
      break;
    }
    // The server has recieved a copy of the canvas from the first user
    case "response-canvas": {
      Canvas.setup(data);
      break;
    }
    // A new user has joined the session
    case "user-joined": {
      Session.addUsers([data.client], data.total);
      break;
    }
    // A user has left the session
    case "user-left": {
      Session.removeUsers(data.client, data.total);
      break;
    }
    // Another user has moved their mouse
    case "mouse-move": {
      const cursor = document.getElementById("cursorIcon-" + data.clientId);
      if (data.outside) {
        cursor.style.display = "none";
      } else {
        const x = (data.pos[0] * Canvas.zoom) + (sessionCanvas.offsetLeft + (sessionCanvas.clientLeft * Canvas.zoom)) - Canvas.container.scrollLeft;
        const y = (data.pos[1] * Canvas.zoom) + (sessionCanvas.offsetTop + (sessionCanvas.clientTop * Canvas.zoom)) - Canvas.container.scrollTop;
        cursor.style.left = x + "px";
        cursor.style.top = y + "px";
        cursor.style.display = "block";
      }
      break;
    }
    case "password-set": {
      if (data.clientId === thisClientId) Modal.close("setSessionPasswordModal");
      Session.updatePassword(data.password);
      break;
    }
    case "enter-password": {
      document.getElementById("enterSessionPasswordId").textContent = data.id;
      Modal.open("enterSessionPasswordModal");
      break;
    }
    case "wrong-password": {
      document.getElementById("sessionWrongPassword").textContent = data.password;
      document.getElementById("sessionWrongPasswordId").textContent = data.id;
      Modal.open("sessionWrongPasswordModal");
      break;
    }
    // User has joined the session successfully
    case "session-joined": {
      Modal.close("enterSessionPasswordModal");
      
      document.getElementById("menuScreen").style.display = "none";
      document.getElementById("drawScreen").style.display = "grid";
      if (data.total !== 1) Modal.open("retrieveModal");
      Session.updateId(data.id);
      Session.updatePassword(data.password);
      ActionHistory.clearUndo();
      ActionHistory.clearRedo();
      
      // Set up tool variables and inputs
      TOOL_SETTINGS_SLIDERS.forEach((input) => {
        const slider = document.getElementById(input.id + "Input");
        Slider.setValue(input.id, input.defaultVal, false);
      });
      
      changeColour(START_COLOURS[0], 0, false);
      changeColour(START_COLOURS[1], 1, false);
      
      document.getElementById("lineCapSelect").value = 0;
      
      document.getElementById("cursorPos").textContent = "0, 0";
      
      document.getElementById("compositeSelect").value = 0;
      
      document.getElementById("fillBySelect").value = 0;
      document.getElementById("fillChangeAlpha").checked = true;
      
      document.getElementById("colourPickerMerge").checked = false;
      document.getElementById("colourPickerOpacity").checked = false;
      
      document.getElementById("shapeOutline").checked = true;
      document.getElementById("shapeFill").checked = false;
      
      // Select pen tool
      switchTool(PEN_TOOL);
      
      // Set up quick colour select colours
      const quickColourSelect = document.getElementById("quickColourSelect");
      const children = quickColourSelect.children;
      for (var i = children.length - 1; i >= 0; i--) {
        children[i].remove();
      }
      BASIC_COLOURS.values.forEach((row, rowNum) => {
        const quickColourRow = document.createElement("tr");
        quickColourRow.classList.add("quickColourRow");
        row.forEach((col, colNum) => {
          const colour = document.createElement("td");
          colour.classList.add("quickColour");
          colour.style.backgroundColor = col;
          colour.title = `${BASIC_COLOURS.names[rowNum][colNum]}\nLeft or right click to set colour`;
          colour.addEventListener("click", (event) => setClickedPenColour(event, col));
          colour.addEventListener("contextmenu", (event) => setClickedPenColour(event, col));
          quickColourRow.appendChild(colour);
        });
        quickColourSelect.appendChild(quickColourRow);
      });
      const customColourRow = document.createElement("tr");
      customColourRow.classList.add("quickColourRow");
      customColourRow.id = "customColourRow";
      for (var i = 0; i < BASIC_COLOURS.values[0].length; i++) {
        const customColour = document.createElement("td");
        customColour.classList.add("quickColour", "customColour");
        customColourRow.appendChild(customColour);
      }
      quickColourSelect.appendChild(customColourRow);
      
      Chat.input.value = "";
      Chat.box.classList.remove("displayNone");
      elementFitHeight(Chat.input);
      Chat.box.classList.add("displayNone");
      
      // Set canvas size
      sessionCanvas.width = Canvas.CANVAS_WIDTH;
      sessionCanvas.height = Canvas.CANVAS_HEIGHT;
      thisCanvas.width = Canvas.CANVAS_WIDTH;
      thisCanvas.height = Canvas.CANVAS_HEIGHT;
      // Resize if too big
      Canvas.setZoom(Canvas.DEFAULT_ZOOM);
      Canvas.zoomToWindow("fit", false);
      // Fill canvas with white
      sessionCtx.fillStyle = BLANK_COLOUR;
      sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      
      Session.addUsers(data.clients, data.total);
      
      break;
    }
    // The session the user has tried to join does not exist
    case "session-no-exist": {
      Modal.close("enterSessionPasswordModal");
      document.getElementById("sessionNoExist").textContent = data.id;
      Modal.open("sessionNoExistModal");
      break;
    }
    // The session the user has tried to create already exists
    case "session-already-exist": {
      document.getElementById("sessionAlreadyExist").textContent = data.id;
      Modal.open("sessionAlreadyExistModal");
      break;
    }
    case "session-id-changed": {
      Session.updateId(data.id);
      if (data.clientId === thisClientId) {
        Modal.close("changeSessionIdModal");
        document.getElementById("sessionIdChanged").textContent = data.id;
        Modal.open("sessionIdChangedModal");
      }
      break;
    }
    case "session-has-id": {
      document.getElementById("sessionHasId").textContent = data.id;
      Modal.open("sessionHasIdModal");
      break;
    }
    // An unknown message has been sent from the server. This should never happen!!!
    default: {
      console.error("Unknown message!", data);
      return;
    }
  }
};

// Set up events that end or cancel actions for all of the page in case it happens outside of the canvas
document.addEventListener("pointermove", (event) => mouseMove(event), { passive: false });
document.addEventListener("pointerup", (event) => clearMouseHold(event), { passive: false });
document.addEventListener("pointercancel", (event) => clearMouseHold(event), { passive: false });
document.addEventListener("pointerleave", (event) => clearMouseHold(event), { passive: false });
document.addEventListener("contextmenu", (event) => {
  const tagName = event.target.tagName;
  if (tagName === "A" || tagName === "INPUT" || tagName === "TEXTAREA") return;
  event.preventDefault();
  event.stopPropagation();
});
document.addEventListener("click", (event) => {
  if (event.target.tagName == "LI") return;
  const selected = document.getElementsByClassName("menuSelected");
  for (var i = 0; i < selected.length; i++) {
    selected[i].classList.remove("menuSelected");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target.tagName !== "BODY") {
    if (!event.ctrlKey) {
      switch (event.key) {
        case "F1": {
          Modal.open("helpModal");
          break;
        }
        case "Escape": {
          Chat.toggle();
          break;
        }
        default: return;
      }
      return;
    } else {
      return;
    }
  }
  if (!event.ctrlKey) {
    switch (event.key) {
      case "F1": {
        Modal.open("helpModal");
        break;
      }
      case "1": {
        Canvas.setZoom(1);
        break;
      }
      case "2": {
        Canvas.setZoom(2);
        break;
      }
      case "3": {
        Canvas.setZoom(4);
        break;
      }
      case "4": {
        Canvas.setZoom(8);
        break;
      }
      case "5": {
        Canvas.setZoom(16);
        break;
      }
      case "=": {
        Canvas.changeZoom(0.1);
        break;
      }
      case "-": {
        Canvas.changeZoom(-0.1);
        break;
      }
      case "Escape": {
        Chat.toggle();
        break;
      }
      default: return;
    }
  } else {
    switch (event.key) {
      case "z": {
        ActionHistory.doUndo();
        break;
      }
      case "Z":
      case "y": {
        ActionHistory.doRedo();
        break;
      }
      case "c": {
        if (tool !== RECT_SELECT_TOOL) return;
        Selection.doCopy();
        break;
      }
      case "x": {
        if (tool !== RECT_SELECT_TOOL) return;
        Selection.doCut();
        break;
      }
      case "v": {
        if (tool !== RECT_SELECT_TOOL) return;
        Selection.doPaste();
        break;
      }
      default: return;
    }
  }
  event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Control") ctrlKey = true;
});
document.addEventListener("keyup", (event) => {
  if (event.key === "Control") ctrlKey = false;
});

var upTimeout, downTimeout;
document.addEventListener("pointerup", () => {
  clearTimeout(upTimeout);
  clearTimeout(downTimeout);
});

// Set up events for the canvas, but not the move or ending ones (see above event listeners)
Canvas.container.addEventListener("pointerdown", (event) => mouseHold(event));
Canvas.container.addEventListener("wheel", (event) => {
  if (!ctrlKey) return;
  event.preventDefault();
  const delta = Math.sign(event.deltaY) * -0.25;
  Canvas.changeZoom(delta);
});

// Set up inputs
document.getElementById("createSessionBtn").addEventListener("click", () => Session.create());
document.getElementById("joinSessionBtn").addEventListener("click", () => Session.join());

TOOL_SETTINGS_SLIDERS.forEach((input) => {
  const slider = document.getElementById(input.id + "Input");
  document.getElementById(input.id + "Value").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    var value = parseFloat(event.target.textContent);
    if (typeof value !== "number" || isNaN(value)) return;
    if (value > slider.dataset.max) {
      value = parseFloat(slider.dataset.max);
    } else if (value < slider.dataset.min) {
      value = parseFloat(slider.dataset.min);
    }
    Slider.setValue(input.id, value);
  });
  const up = document.getElementById(input.id + "ValueUp");
  const down = document.getElementById(input.id + "ValueDown");
  up.addEventListener("pointerdown", (event) => {
    Slider.doArrow(input.id, "up");
    upTimeout = setTimeout(function repeatUp() {
      Slider.doArrow(input.id, "up");
      upTimeout = setTimeout(() => repeatUp(), 30);
    }, 300);
    event.stopPropagation();
  });
  down.addEventListener("pointerdown", (event) => {
    Slider.doArrow(input.id, "down");
    downTimeout = setTimeout(function repeatDown() {
      Slider.doArrow(input.id, "down");
      downTimeout = setTimeout(() => repeatDown(), 30);
    }, 300);
    event.stopPropagation();
  });
  slider.addEventListener("pointerdown", (event) => {
    Slider.current = input.id;
    Slider.update(event);
  });
});

const colourPicker = document.getElementById("colourPicker");
colourPicker.addEventListener("input", (event) => {
  updateColour(event.target.value, currentPen);
});
colourPicker.addEventListener("change", (event) => {
  changeColour(event.target.value, currentPen);
});

const quickColourSelect = document.getElementById("quickColourSelect");
quickColourSelect.addEventListener("click", (event) => { event.preventDefault(); });
quickColourSelect.addEventListener("contextmenu", (event) => { event.preventDefault(); });

document.getElementById("choosePicture").addEventListener("change", (event) => importPicture(event));
document.getElementById("chooseCanvasFile").addEventListener("change", (event) => Canvas.open(event));

const penColourBoxes = document.getElementsByClassName("penColour");
for (let i = 0; i < penColourBoxes.length; i++) {
  const penColourBox = penColourBoxes[i];
  penColourBox.addEventListener("click", () => {
    currentPen = i;
    selectColour(i);
  });
  penColourBox.addEventListener("contextmenu", () => {
    currentPen = i;
    selectColour(i);
  });
}
const penColourValues = document.getElementsByClassName("penColourValue");
for (let i = 0; i < penColourValues.length; i++) {
  penColourValues[i].addEventListener("keydown", (event) => {
    if (event.key === "Enter") changeColourValue(event, i);
  });
}
for (let i = 0; i < NUM_TOOLS; i++) {
  document.getElementById(TOOLS[i] + "Btn").addEventListener("click", () => switchTool(i));
}

const menuLabels = document.getElementsByClassName("menuLabel");
for (let i = 0; i < menuLabels.length; i++) {
  const menuLabel = menuLabels[i];
  if (menuLabel.parentElement.getElementsByClassName("menuDropdown").length > 0) {
    menuLabel.addEventListener("click", () => {
      const selected = document.getElementsByClassName("menuSelected");
      for (var i = 0; i < selected.length; i++) {
        if (selected[i] !== menuLabel.parentElement) selected[i].classList.remove("menuSelected");
      }
      menuLabel.parentElement.classList.toggle("menuSelected");
      event.stopPropagation();
    });
  }
}
document.getElementById("fileSaveBtn").addEventListener("click", () => Canvas.save());
document.getElementById("fileOpenBtn").addEventListener("click", () => openCanvas());
document.getElementById("fileExportBtn").addEventListener("click", () => Canvas.export());
document.getElementById("fileImportBtn").addEventListener("click", () => selectImport());
document.getElementById("editUndoBtn").addEventListener("click", () => ActionHistory.doUndo());
document.getElementById("editRedoBtn").addEventListener("click", () => ActionHistory.doRedo());
document.getElementById("editClearBtn").addEventListener("click", () => clearCanvasBlank());
document.getElementById("editClearTransparentBtn").addEventListener("click", () => clearCanvas());
document.getElementById("editResizeBtn").addEventListener("click", () => chooseCanvasSize());
document.getElementById("viewResetZoomBtn").addEventListener("click", () => Canvas.setZoom(Canvas.DEFAULT_ZOOM));
document.getElementById("viewFitZoomBtn").addEventListener("click", () => Canvas.zoomToWindow("fit"));
document.getElementById("viewFillZoomBtn").addEventListener("click", () => Canvas.zoomToWindow("fill"));
document.getElementById("sessionInfoBtn").addEventListener("click", () => Modal.open("sessionInfoModal"));
document.getElementById("sessionChangeIdBtn").addEventListener("click", () => {
  document.getElementById("sessionIdNew").value = Session.id;
  Modal.open("changeSessionIdModal");
});
document.getElementById("sessionSetPasswordBtn").addEventListener("click", () => Modal.open("setSessionPasswordModal"));
document.getElementById("sessionShareLinkBtn").addEventListener("click", () => Modal.open("shareSessionLinkModal"));
document.getElementById("sessionLeaveBtn").addEventListener("click", () => Session.leave());
document.getElementById("helpHelpBtn").addEventListener("click", () => Modal.open("helpModal"));
document.getElementById("helpInfoBtn").addEventListener("click", () => Modal.open("infoModal"));
document.getElementById("helpBtn").addEventListener("click", () => Modal.open("helpModal"));
document.getElementById("infoBtn").addEventListener("click", () => Modal.open("infoModal"));
document.getElementById("userBtn").addEventListener("click", () => {
  document.getElementById("userNameInput").value = clients.get(thisClientId).name || "";
  Modal.open("userModal");
});
document.getElementById("chatBtn").addEventListener("click", () => Chat.toggle());
document.getElementById("chatXBtn").addEventListener("click", () => {
  Chat.box.classList.add("displayNone");
});

Chat.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    Chat.send();
    event.preventDefault();
  }
});
Chat.input.addEventListener("input", () => {
  const box = document.getElementById("chatMessages");
  const isAtBottom = box.scrollTop == box.scrollHeight - box.clientHeight;
  elementFitHeight(Chat.input);
  if (isAtBottom) box.scrollTop = box.scrollHeight - box.clientHeight;
});
document.getElementById("chatSendBtn").addEventListener("click", () => Chat.send());

document.getElementById("undoBtn").addEventListener("click", () => ActionHistory.doUndo());
document.getElementById("redoBtn").addEventListener("click", () => ActionHistory.doRedo());
const clearBtn = document.getElementById("clearBtn");
clearBtn.addEventListener("click", () => clearCanvasBlank());
clearBtn.addEventListener("dblclick", () => clearCanvas());
document.getElementById("resetZoomBtn").addEventListener("click", () => Canvas.setZoom(Canvas.DEFAULT_ZOOM));
document.getElementById("fitZoomBtn").addEventListener("click", () => Canvas.zoomToWindow("fit"));

document.getElementById("shareLinkBtn").addEventListener("click", () => Modal.open("shareSessionLinkModal"));
document.getElementById("leaveBtn").addEventListener("click", () => Session.leave());

[...document.getElementsByClassName("clickToCopy")].forEach((el) => {
  el.addEventListener("click", (event) => copyText(el.textContent, event));
});
document.getElementById("allPingsLink").addEventListener("click", () => Modal.open("allPingsModal"));

document.getElementById("allPingsModalDoneBtn").addEventListener("click", () => Modal.close("allPingsModal"));

document.getElementById("resizeModalOkBtn").addEventListener("click", () => resizeCanvas());
document.getElementById("resizeModalCancelBtn").addEventListener("click", () => Modal.close("canvasResizeModal"));
document.getElementById("canvasResizeModal").addEventListener("keydown", () => {
  if (event.key === "Enter") {
    document.getElementById("resizeModalOkBtn").click();
  }
});

document.getElementById("helpModalDoneBtn").addEventListener("click", () => {
  Modal.close("helpModal");
  location.hash = "";
});
document.getElementById("infoModalDoneBtn").addEventListener("click", () => Modal.close("infoModal"));

document.getElementById("sessionInfoModalDoneBtn").addEventListener("click", () => Modal.close("sessionInfoModal"));

document.getElementById("sessionIdModalChangeBtn").addEventListener("click", () => Session.changeId());
document.getElementById("sessionIdModalCancelBtn").addEventListener("click", () => Modal.close("changeSessionIdModal"));
document.getElementById("sessionIdChangedModalOkBtn").addEventListener("click", () => Modal.close("sessionIdChangedModal"));
document.getElementById("sessionHasIdModalOkBtn").addEventListener("click", () => Modal.close("sessionHasIdModal"));

document.getElementById("setSessionPasswordModalRemoveBtn").addEventListener("click", () => {
  sendMessage({
    type: "session-password",
    password: null
  });
});
document.getElementById("setSessionPasswordModalSetBtn").addEventListener("click", () => Session.setPassword());
document.getElementById("setSessionPasswordModalCancelBtn").addEventListener("click", () => Modal.close("setSessionPasswordModal"));

document.getElementById("shareLinkModalCloseBtn").addEventListener("click", () => Modal.close("shareSessionLinkModal"));
document.getElementById("sessionLinkCopy").addEventListener("click", (event) => copyText(Session.link));
document.getElementById("sessionLinkPasswordInput").addEventListener("input", () => Session.updateLink());

document.getElementById("enterSessionPasswordModalJoinBtn").addEventListener("click", () => Session.enterPassword());
document.getElementById("enterSessionPasswordModalCancelBtn").addEventListener("click", () => Modal.close("enterSessionPasswordModal"));
document.getElementById("sessionWrongPasswordModalOkBtn").addEventListener("click", () => Modal.close("sessionWrongPasswordModal"));

document.getElementById("appInfoLink").addEventListener("click", () => Modal.open("appInfoModal"));
document.getElementById("appInfoModalDoneBtn").addEventListener("click", () => Modal.close("appInfoModal"));

document.getElementById("errorModalOkBtn").addEventListener("click", () => Modal.close("errorModal"));
document.getElementById("oldCanvasFileModalOkBtn").addEventListener("click", () => Modal.close("oldCanvasFileModal"));
document.getElementById("disconnectModalOkBtn").addEventListener("click", () => Modal.close("disconnectModal"));
document.getElementById("sessionNoExistModalOkBtn").addEventListener("click", () => Modal.close("sessionNoExistModal"));
document.getElementById("sessionAlreadyExistModalOkBtn").addEventListener("click", () => Modal.close("sessionAlreadyExistModal"));

document.getElementById("userModalSaveBtn").addEventListener("click", () => Session.saveUserSettings());
document.getElementById("userModalCancelBtn").addEventListener("click", () => Modal.close("userModal"));

document.getElementById("canvasZoom").addEventListener("input", (event) => Canvas.setZoomValue(event));

document.getElementById("selectCopyBtn").addEventListener("click", () => Selection.doCopy());
document.getElementById("selectCutBtn").addEventListener("click", () => Selection.doCut());
document.getElementById("selectPasteBtn").addEventListener("click", () => Selection.doPaste());
document.getElementById("selectClearBtn").addEventListener("click", () => {
  sendMessage({
    type: "selection-clear",
    colour: penColours[1],
    clientId: thisClientId
  });
  Selection.clear(currentAction.data, penColours[1]);
});

window.addEventListener("beforeunload", () => {
  socket.onclose = () => Session.leave();
  socket.close(1000);
});

})();
