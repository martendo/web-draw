//------------------------------------------------------------------------------
// Web Draw
// A little real-time online drawing program.
//------------------------------------------------------------------------------

"use strict";

// Immediately Invoked Function Expression
(function () {

// The URL of the WebSockets server
const WSS_URL = "wss://web-draw.herokuapp.com";

// Starting canvas dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Send mouse movement update to server (if mouse has moved since last update)
// every X ms.
const MOUSEMOVE_UPDATE_INTERVAL = 50;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

// Callback functions
const CALLBACKS = {
  "updateColourValueAlpha": updateColourValueAlpha
};

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

const DEFAULT_SCALE = 1;
const MIN_SCALE     = 0;

// All the slider inputs to set up
const TOOL_SETTINGS_SLIDERS = [
  { id: "penWidth", defaultVal: 10 },
  { id: "opacity", defaultVal: 100 },
  { id: "fillThreshold", defaultVal: 15 }
];

// Current modal z-index - newest modal should always show up at the top
var modalIndex = 99;

// List of ping latency measurements to calculate average
var prevPings = [];

const NO_ACTION = {
  type: null,
  data: null
};

// Drawing and tool variables
var currentInput = null;
var currentAction = NO_ACTION, penColours = START_COLOURS.slice();
var currentPen = 0;
var tool = PEN_TOOL, scale = DEFAULT_SCALE;

// Selection constants & variables
const NO_SELECTION = {
  selected: false,
  move: {},
  resize: {}
};
const SELECT_HANDLE_SIZE = 5;
const SELECT_HANDLE_GRAB_SIZE = 15;

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
// All past actions (for undo) and undone actions (for redo)
var undoActions = [], redoActions = [];

// Temporary canvasses for all other clients in the session
const clientCanvasses = new Map;
// Session canvas (permanent)
const sessionCanvas = document.getElementById("sessionCanvas");
const sessionCtx = sessionCanvas.getContext("2d");
// User's temporary canvas
const thisCanvas = document.getElementById("thisCanvas");
const thisCtx = thisCanvas.getContext("2d");

// Keep user's client ID and session ID
var thisClientId, thisSessionId;

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

// Show/Hide modals
function modalOpen(id) {
  const modal = document.getElementById(id);
  // `grid` centres content without translate but others don't...
  modal.style.display = "grid";
  modal.style.zIndex = ++modalIndex;
}
function modalClose(id) {
  document.getElementById(id).style.display = "none";
  const modals = document.getElementsByClassName("modal");
  for (var i = 0; i < modals.length; i++) {
    const modal = modals[i];
    if (modal.style.display !== "none" && modal.style.display !== "") return;
  }
  modalIndex = 99;
}

// Scale the canvas with the mouse wheel or pinch gesture
function zoom(delta) {
  if (scale + delta >= MIN_SCALE) {
    scale += delta;
    setCanvasScale(parseFloat(scale.toFixed(2)));
  }
}
// Set the canvas scale with the number input
function scaleCanvas(event) {
  setCanvasScale(parseFloat(event.currentTarget.value));
}
// Set the canvas scale to whatever fits in the container, optionally only if
// it doesn't already fit
function scaleCanvasToFit(allowLarger = true) {
  thisCanvas.style.transform = "scale(0)";
  sessionCanvas.style.transform = "scale(0)";
  clientCanvasses.forEach((clientCanvas) => {
    clientCanvas.style.transform = "scale(0)";
  });
  
  const canvasConatiner = document.getElementById("canvasContainer");
  const canvasContainerWidth = canvasContainer.clientWidth - (15 * 2);
  const canvasContainerHeight = canvasContainer.clientHeight - (15 * 2);
  const widthScale = canvasContainerWidth / sessionCanvas.width;
  const heightScale = canvasContainerHeight / sessionCanvas.height;
  const fitScale = Math.min(widthScale, heightScale);
  const newScale = (fitScale < scale || allowLarger) ? fitScale : scale;
  setCanvasScale(newScale);
}
// Set the canvas scale
function setCanvasScale(s) {
  scale = s;
  document.getElementById("canvasScale").value = scale;
  thisCanvas.style.transform = `scale(${scale})`;
  sessionCanvas.style.transform = `scale(${scale})`;
  clientCanvasses.forEach((clientCanvas) => {
    clientCanvas.style.transform = `scale(${scale})`;
  });
}

// Set up the modal to resize the canvas
function chooseCanvasSize() {
  document.getElementById("canvasResizeWidth").value = sessionCanvas.width;
  document.getElementById("canvasResizeHeight").value = sessionCanvas.height;
  modalOpen("canvasResizeModal");
}
// Set the canvas size
function resizeCanvas() {
  modalClose("canvasResizeModal");
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

function updateSliderInput(event) {
  if (!currentInput) return;
  const input = document.getElementById(currentInput + "Input");
  const rect = input.getBoundingClientRect();
  const dx = event.clientX - rect.left;
  var fraction = dx / rect.width;
  const min = parseFloat(input.dataset.min);
  const value = Math.min(Math.max((fraction * (input.dataset.width - min)) + min, min), input.dataset.max);
  setSliderValue(currentInput, value);
}
function setSliderValue(id, value, doCallback = true) {
  const input = document.getElementById(id + "Input");
  value = value.toFixed(input.dataset.dplaces);
  input.dataset.value = value;
  document.getElementById(id + "Value").textContent = value;
  const min = parseFloat(input.dataset.min);
  document.getElementById(id + "Bar").style.width = Math.max(Math.min((value - min) / (parseFloat(input.dataset.width) - min) * 100, 100), 0) + "%";
  if (input.dataset.callback && doCallback) CALLBACKS[input.dataset.callback](value);
}
function sliderValUpDown(id, dir) {
  const slider = document.getElementById(id + "Input");
  const newVal = Math.min(Math.max(parseFloat(slider.dataset.value) + (dir ? 1 : -1), slider.dataset.min), slider.dataset.max);
  setSliderValue(id, newVal);
}

// Add a point to the current stroke and draw it
function draw(x, y) {
  if (currentAction.type !== "stroke") return false;
  const lastPoint = currentAction.data.points[currentAction.data.points.length - 1];
  if (currentAction.data.points.length > 0 && x === lastPoint.x && y === lastPoint.y) return;
  sendMessage({
    type: "add-stroke",
    clientId: thisClientId,
    x: x,
    y: y
  });
  currentAction.data.points.push({
    x: x,
    y: y
  });
  drawStroke(thisCtx, currentAction.data);
}
// Add a point to another client's current stroke and draw it
function drawClientStroke(clientId) {
  const ctx = clientCanvasses.get(clientId).getContext("2d");
  const stroke = clientStrokes.get(clientId);
  drawStroke(ctx, stroke);
}
// Commit a stroke to the session canvas (copy it then erase it)
function commitStroke(srcCanvas, stroke, user = true) {
  drawStroke(sessionCtx, stroke, false);
  srcCanvas.getContext("2d").clearRect(0, 0, srcCanvas.width, srcCanvas.height);
  if (user) {
    addToUndo({
      type: "stroke",
      stroke: {...stroke}
    });
  }
}

// Draw a full stroke
function drawStroke(ctx, stroke, user = true) {
  if (user) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  var p0 = stroke.points[0],
      p1 = stroke.points[1];
  
  ctx.strokeStyle = stroke.colour;
  ctx.lineCap = CAPS[stroke.caps];
  ctx.lineWidth = stroke.size;
  ctx.globalAlpha = stroke.opacity;
  ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[stroke.compOp];
  
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  
  for (var i = 0; i < stroke.points.length - 1; i++) {
    const p0 = stroke.points[i], p1 = stroke.points[i + 1];
    const midPoint = {
      x: (p0.x + p1.x) / 2,
      y: (p0.y + p1.y) / 2
    };
    ctx.quadraticCurveTo(p0.x, p0.y, midPoint.x, midPoint.y);
  }
  ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  ctx.stroke();
  
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = DEFAULT_COMP_OP;
}

// Convert hex colour value to an RGBA array
function hexToRgb(colour, alpha = 255) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colour);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    alpha
  ] : null;
}
function rgbToHex(colour) {
  return "#" + ("000000" + ((colour[0] << 16) + (colour[1] << 8) + colour[2]).toString(16)).substr(-6);
}

// Determine whether a colour is within the flood fill threshold
function checkPixelFill(pixels, offset, colour, threshold, fillBy) {
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
}
// Fill an area of the same colour
function fill(startX, startY, colour, threshold, opacity, compOp, fillBy, changeAlpha, user = true) {
  const fillColour = hexToRgb(colour, 255 * opacity);
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
    while(y-- >= 0 && checkPixelFill(pixels, pixelPos, originalColour, threshold, fillBy)) {
      pixelPos -= canvasWidth * 4;
    }
    pixelPos += canvasWidth * 4;
    y++;
    var reachLeft = reachRight = false;
    while(y++ < canvasHeight - 1 && checkPixelFill(pixels, pixelPos, originalColour, threshold, fillBy)) {
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
        if (checkPixelFill(pixels, pixelPos - 4, originalColour, threshold, fillBy)) {
          if (!reachLeft) {
            pixelStack.push([x - 1, y]);
            reachLeft = true;
          }
        } else if (reachLeft) {
          reachLeft = false;
        }
      }
      if (x < canvasWidth - 1 && !seen[pixelPos + 4]) {
        if (checkPixelFill(pixels, pixelPos + 4, originalColour, threshold, fillBy)) {
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
    addToUndo({
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

function checkSelectResizeHandle(point, vals) {
  if (!currentAction.data.selected) return false;
  var val = null;
  if (isPointInside(point.x, point.y, {
    x: currentAction.data.x - (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y - (SELECT_HANDLE_GRAB_SIZE / 2),
    width: SELECT_HANDLE_GRAB_SIZE,
    height: SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[0];
  } else if (isPointInside(point.x, point.y, {
    x: currentAction.data.x + (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y - (SELECT_HANDLE_GRAB_SIZE / 2),
    width: currentAction.data.width - SELECT_HANDLE_GRAB_SIZE,
    height: SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[1];
  } else if (isPointInside(point.x, point.y, {
    x: currentAction.data.x + currentAction.data.width - (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y - (SELECT_HANDLE_GRAB_SIZE / 2),
    width: SELECT_HANDLE_GRAB_SIZE,
    height: SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[2];
  } else if (isPointInside(point.x, point.y, {
    x: currentAction.data.x - (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y + (SELECT_HANDLE_GRAB_SIZE / 2),
    width: SELECT_HANDLE_GRAB_SIZE,
    height: currentAction.data.height - SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[3];
  } else if (isPointInside(point.x, point.y, {
    x: currentAction.data.x + currentAction.data.width - (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y + (SELECT_HANDLE_GRAB_SIZE / 2),
    width: SELECT_HANDLE_GRAB_SIZE,
    height: currentAction.data.height - SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[4];
  } else if (isPointInside(point.x, point.y, {
    x: currentAction.data.x - (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y + currentAction.data.height - (SELECT_HANDLE_GRAB_SIZE / 2),
    width: SELECT_HANDLE_GRAB_SIZE,
    height: SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[5];
  } else if (isPointInside(point.x, point.y, {
    x: currentAction.data.x + (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y + currentAction.data.height - (SELECT_HANDLE_GRAB_SIZE / 2),
    width: currentAction.data.width - SELECT_HANDLE_GRAB_SIZE,
    height: SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[6];
  } else if (isPointInside(point.x, point.y, {
    x: currentAction.data.x + currentAction.data.width - (SELECT_HANDLE_GRAB_SIZE / 2),
    y: currentAction.data.y + currentAction.data.height - (SELECT_HANDLE_GRAB_SIZE / 2),
    width: SELECT_HANDLE_GRAB_SIZE,
    height: SELECT_HANDLE_GRAB_SIZE
  })) {
    val = vals[7];
  }
  return val;
}
function drawSelection(ctx, sel, handles, drawOld = true) {
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
  if (sel.data) drawSelectionData(ctx, sel);
  
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
    ctx.fillRect(sel.x - (SELECT_HANDLE_SIZE / 2), sel.y - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Top middle
    ctx.fillRect(sel.x + (sel.width / 2) - (SELECT_HANDLE_SIZE / 2), sel.y - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Top right
    ctx.fillRect(sel.x + sel.width - (SELECT_HANDLE_SIZE / 2), sel.y - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Left middle
    ctx.fillRect(sel.x - (SELECT_HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Right middle
    ctx.fillRect(sel.x + sel.width - (SELECT_HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Bottom left
    ctx.fillRect(sel.x - (SELECT_HANDLE_SIZE / 2), sel.y + sel.height - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Bottom middle
    ctx.fillRect(sel.x + (sel.width / 2) - (SELECT_HANDLE_SIZE / 2), sel.y + sel.height - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Bottom right
    ctx.fillRect(sel.x + sel.width - (SELECT_HANDLE_SIZE / 2), sel.y + sel.height - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // STROKE
    ctx.strokeStyle = "#000000";
    // Top left
    ctx.strokeRect(sel.x - (SELECT_HANDLE_SIZE / 2), sel.y - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Top middle
    ctx.strokeRect(sel.x + (sel.width / 2) - (SELECT_HANDLE_SIZE / 2), sel.y - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Top right
    ctx.strokeRect(sel.x + sel.width - (SELECT_HANDLE_SIZE / 2), sel.y - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Left middle
    ctx.strokeRect(sel.x - (SELECT_HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Right middle
    ctx.strokeRect(sel.x + sel.width - (SELECT_HANDLE_SIZE / 2), sel.y + (sel.height / 2) - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Bottom left
    ctx.strokeRect(sel.x - (SELECT_HANDLE_SIZE / 2), sel.y + sel.height - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Bottom middle
    ctx.strokeRect(sel.x + (sel.width / 2) - (SELECT_HANDLE_SIZE / 2), sel.y + sel.height - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
    // Bottom right
    ctx.strokeRect(sel.x + sel.width - (SELECT_HANDLE_SIZE / 2), sel.y + sel.height - (SELECT_HANDLE_SIZE / 2),
                     SELECT_HANDLE_SIZE, SELECT_HANDLE_SIZE);
  }
}
function updateSelection(handles) {
  drawSelection(thisCtx, currentAction.data, handles);
  
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
}
function drawSelectionData(ctx, sel) {
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
}
function cutSelectedPixels(ctx, sel, colour) {
  copySelectedPixels(ctx, sel);
  clearSelectedPixels(sel, colour);
}
function copySelectedPixels(ctx, sel) {
  sel.data = sessionCtx.getImageData(sel.x, sel.y, sel.width, sel.height);
  drawSelection(ctx, sel, true);
}
function pasteSelectedPixels(sel, user = true) {
  if (sel.data) drawSelectionData(sessionCtx, sel);
  if (user) {
    addToUndo({
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
}
function clearSelectedPixels(sel, colour, user = true) {
  sessionCtx.fillStyle = colour;
  sessionCtx.fillRect(sel.x, sel.y, sel.width, sel.height);
  if (user) {
    addToUndo({
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
}
function selectCopy() {
  if (!currentAction.data.selected) return;
  sendMessage({
    type: "selection-copy",
    clientId: thisClientId
  });
  copySelectedPixels(thisCtx, currentAction.data);
}
function selectCut() {
  if (!currentAction.data.selected) return;
  sendMessage({
    type: "selection-cut",
    colour: penColours[1],
    clientId: thisClientId
  });
  cutSelectedPixels(thisCtx, currentAction.data, penColours[1]);
}
function selectPaste() {
  if (!currentAction.data.selected || !currentAction.data.data) return;
  sendMessage({
    type: "selection-paste",
    clientId: thisClientId
  });
  pasteSelectedPixels(currentAction.data);
}
function clearSelection() {
  sendMessage({
    type: "clear-selection",
    clientId: thisClientId
  });
  currentAction = NO_ACTION;
  thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
}
function absoluteSelectionSize() {
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

function drawLine(line, ctx, user = true) {
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

function drawRect(rect, ctx, user = true) {
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

function drawEllipse(ellipse, ctx, user = true) {
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
  const canvasContainer = document.getElementById("canvasContainer");
  mouse.x += canvasContainer.scrollLeft;
  mouse.y += canvasContainer.scrollTop;
  return {
    x: ~~((mouse.x - (thisCanvas.offsetLeft + (thisCanvas.clientLeft * scale))) / scale),
    y: ~~((mouse.y - (thisCanvas.offsetTop + (thisCanvas.clientTop * scale))) / scale)
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
    const handle = checkSelectResizeHandle(point, [0, 1, 2, 3, 4, 5, 6, 7]);
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
  if (tool !== RECT_SELECT_TOOL) clearSelection();
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
      draw(point.x, point.y);
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
      fill(point.x, point.y, fillColour, threshold, opacity, compOp, fillBy, changeAlpha);
      break;
    }
    case COLOUR_PICKER_TOOL: {
      const pixelColour = sessionCtx.getImageData(point.x, point.y, 1, 1).data;
      const merge = document.getElementById("colourPickerMerge").checked;
      var colour = [0, 0, 0, 0];
      if (merge) {
        const penColour = hexToRgb(penColours[currentPen]);
        for (var i = 0; i < 3; i++) {
          colour[i] = Math.round((pixelColour[i] + penColour[i]) / 2);
        }
      } else {
        colour = pixelColour;
      }
      changeColour(rgbToHex(colour), currentPen);
      if (document.getElementById("colourPickerOpacity").checked) {
        var newOpacity = (pixelColour[3] / 255) * 100;
        if (merge) {
          newOpacity = (newOpacity + (opacity * 100)) / 2;
        }
        setSliderValue("opacity", newOpacity);
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
  updateSliderInput(event);
  switch (currentAction.type) {
    case "stroke": {
      event.preventDefault();
      draw(point.x, point.y);
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
      drawLine(currentAction.data, thisCtx);
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
      drawRect(currentAction.data, thisCtx);
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
      drawEllipse(currentAction.data, thisCtx);
      break;
    }
    case "selecting": {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      updateSelection(false);
      break;
    }
    case "selection-move": {
      event.preventDefault();
      currentAction.data.x += point.x - currentAction.data.move.x;
      currentAction.data.y += point.y - currentAction.data.move.y;
      currentAction.data.move.x = point.x;
      currentAction.data.move.y = point.y;
      updateSelection(true);
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
      absoluteSelectionSize();
      updateSelection(true);
      break;
    }
  }
  if (currentAction.data && currentAction.data.selected) {
    const cursor = checkSelectResizeHandle(point, [
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
  const canvasContainer = document.getElementById("canvasContainer");
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
      draw(point.x, point.y);
      sendMessage({
        type: "end-stroke",
        clientId: thisClientId
      });
      commitStroke(thisCanvas, currentAction.data);
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
      drawLine(currentAction.data, sessionCtx, false);
      addToUndo({
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
      drawRect(currentAction.data, sessionCtx, false);
      addToUndo({
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
      drawEllipse(currentAction.data, sessionCtx, false);
      addToUndo({
        type: "ellipse",
        ellipse: currentAction.data
      });
      break;
    }
    case "selecting": {
      event.preventDefault();
      if (currentAction.data.width && currentAction.data.height) {
        currentAction.data.selected = true;
        absoluteSelectionSize();
        drawSelection(thisCtx, currentAction.data, true);
      } else {
        clearSelection();
      }
      break;
    }
    case "selection-move":
    case "selection-resize": {
      delete currentAction.data.old;
      drawSelection(thisCtx, currentAction.data, true);
      event.preventDefault();
      break;
    }
  }
  currentInput = null;
  currentAction.type = null;
}

// Download canvas image
function download() {
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = sessionCanvas.toDataURL("image/png");
  a.download = "image.png";
  a.click();
}

function saveCanvas() {
  const a = document.createElement("a");
  a.style.display = "none";
  const file = new Blob([JSON.stringify({
    width: sessionCanvas.width,
    height: sessionCanvas.height,
    undoActions: undoActions,
    redoActions: redoActions
  })], { type: "application/json" });
  const url = URL.createObjectURL(file);
  a.href = url;
  a.download = "image.json";
  a.click();
  URL.revokeObjectURL(url);
}
function openCanvas() {
  const filePicker = document.getElementById("chooseCanvasFile");
  filePicker.click();
}
function importCanvas(event) {
  const file = event.currentTarget.files[0];
  const reader = new FileReader();
  reader.onerror = () => {
    window.alert("There was an error reading the file.");
  };
  reader.onload = (event) => {
    modalOpen("retrieveModal");
    setupCanvas(JSON.parse(event.target.result));
  };
  reader.readAsText(file);
}

function setupCanvas(data) {
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
      commitStroke(clientCanvasses.get(clientId), stroke, false);
    });
  }
  // Scale canvas to fit in canvasContainer if it doesn't already
  scaleCanvasToFit(false);
  sessionCtx.fillStyle = BLANK_COLOUR;
  sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
  undoActions = data.undoActions;
  if (undoActions.length) {
    enableUndoActions();
  } else {
    clearUndoActions();
  }
  redoActions = data.redoActions;
  if (redoActions.length) {
    enableRedoActions();
  } else {
    clearRedoActions();
  }
  for (var i = 0; i < undoActions.length; i++) {
    undoRedoAction(undoActions[i]);
  }
  modalClose("retrieveModal");
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
    // Check if colour is one of the basic colours, if it is, don't add it to
    // the custom colours
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
      setSliderValue("opacity", newOpacity);
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
  clearSelection();
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
    addToUndo({
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
    addToUndo({
      type: "clear-blank"
    });
  }
}

// Push an action onto undoActions, enable the undo button, disable the redo
// button
function addToUndo(data) {
  undoActions.push(data);
  enableUndoActions();
  clearRedoActions();
}
// Undo an action, and send a message to undo (from the user)
function doUndo() {
  sendMessage({
    type: "undo"
  });
  undo();
}
// Actually undo an action
function undo() {
  const previousAction = undoActions.pop();
  if (previousAction) {
    redoActions.push(previousAction);
    clearCanvasBlank(false);
    for (var i = 0; i < undoActions.length; i++) {
      undoRedoAction(undoActions[i]);
    }
    enableRedoActions();
  } else {
    clearUndoActions();
  }
  if (!undoActions.length) clearUndoActions();
}
// Redo an action, and send a message to redo (from the user)
function doRedo() {
  sendMessage({
    type: "redo"
  });
  redo();
}
// Actually redo an action
function redo() {
  const previousAction = redoActions.pop();
  if (previousAction) {
    undoActions.push(previousAction);
    undoRedoAction(previousAction);
    enableUndoActions();
  } else {
    clearRedoActions();
  }
  if (!redoActions.length) clearRedoActions();
}
// Handle different types of actions
function undoRedoAction(action) {
  switch (action.type) {
    case "stroke": {
      drawStroke(sessionCtx, action.stroke, false);
      break;
    }
    case "fill": {
      fill(action.x, action.y, action.colour, action.threshold, action.opacity, action.compOp, action.fillBy, action.changeAlpha, false);
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
      clearSelectedPixels(action.selection, action.colour, false);
      break;
    }
    case "selection-paste": {
      const sel = {...action.selection};
      sel.data = new ImageData(
        new Uint8ClampedArray(action.selection.data.data),
        action.selection.data.width,
        action.selection.data.height
      );
      pasteSelectedPixels(sel, false);
      break;
    }
    case "line": {
      drawLine(action.line, sessionCtx, false);
      break;
    }
    case "rect": {
      drawRect(action.rect, sessionCtx, false);
      break;
    }
    case "ellipse": {
      drawEllipse(action.ellipse, sessionCtx, false);
      break;
    }
  }
}
// Enable undo/redo buttons
function enableUndoActions() {
  document.getElementById("undoBtn").disabled = false;
}
function enableRedoActions() {
  document.getElementById("redoBtn").disabled = false;
}
// Disable undo/redo buttons and clear the actions just in case
function clearUndoActions() {
  undoActions = [];
  document.getElementById("undoBtn").disabled = true;
}
function clearRedoActions() {
  redoActions = [];
  document.getElementById("redoBtn").disabled = true;
}

// Copy text to the clipboard
function copyText(event, text) {
  const tooltip = document.getElementById("tooltip");
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
  tooltip.textContent = "Copied!";
  tooltip.style.left = (event.clientX + 20) + "px";
  tooltip.style.top = (event.clientY - 30) + "px";
  tooltip.style.visibility = "visible";
  setTimeout(() => {
    tooltip.style.visibility = "hidden";
  }, 1000);
}

// Add/Remove a user canvas and mouse and update the total
function addUsers(c, total) {
  c.forEach((client) => {
    clients.set(client.id, client);
    if (client.id !== thisClientId) {
      const img = document.createElement("img");
      img.src = "img/cursor.png";
      img.classList.add("cursorIcon");
      img.id = "cursorIcon-" + client.id;
      document.body.appendChild(img);
      const clientCanvas = document.createElement("canvas");
      clientCanvas.classList.add("clientCanvas");
      clientCanvas.id = "clientCanvas-" + client.id;
      clientCanvas.width = sessionCanvas.width;
      clientCanvas.height = sessionCanvas.height;
      clientCanvas.style.transform = `scale(${scale})`;
      document.getElementById("canvasContainer").appendChild(clientCanvas);
      clientCanvasses.set(client.id, clientCanvas);
    }
  });
  updateUserInfo(total);
}
function removeUsers(client, total) {
  clients.delete(client.id);
  if (client.id !== thisClientId) {
    const img = document.getElementById("cursorIcon-" + client.id);
    img.remove();
    document.getElementById("clientCanvas-" + client.id).remove();
    clientCanvasses.delete(client.id);
  }
  updateUserInfo(total);
}
// Update the total number of users connected to the current session
function updateUserInfo(num) {
  var isAre = "are", s = "s";
  if (num == 1) {
    isAre = "is";
    s = "";
  }
  document.getElementById("userBox").innerHTML = `There ${isAre} <a href="javascript:void(0)" id="userCount">${num} user${s}</a> connected to this session.`;
  document.getElementById("userCount").onclick = () => modalOpen("sessionInfoModal");
  
  document.getElementById("sessionInfoClients").textContent = num;
  updateSessionInfoClientTable();
}

function updateSessionInfoClientTable() {
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
      document.getElementById("chatBox").classList.remove("displayNone");
      openChatBox();
      addMessageTo(clientList[i].id);
      modalClose("sessionInfoModal");
    });
  }
}

// Request to create a new session
function createSession() {
  sendMessage({
    type: "create-session",
    id: document.getElementById("sessionIdInput").value
  });
}
// Request to join a session
function joinSession() {
  sendMessage({
    type: "join-session",
    id: document.getElementById("sessionIdInput").value
  });
}
// Leave a session
function leaveSession() {
  sendMessage({
    type: "leave-session"
  });
  sessionLeft();
}
function sessionLeft() {
  document.getElementById("menuScreen").style.display = "grid";
  document.getElementById("drawScreen").style.display = "none";
  const cursors = document.getElementsByClassName("cursorIcon");
  for (var i = 0; i < cursors.length; i++) {
    cursors[i].remove();
  }
  location.hash = "";
  document.getElementById("sessionIdInfo").textContent = "N/A";
}

function changeSessionId() {
  sendMessage({
    type: "session-id",
    id: document.getElementById("sessionIdNew").value
  });
}

function setSessionId(id) {
  thisSessionId = id;
  location.hash = encodeURIComponent(thisSessionId);
  document.getElementById("sessionId").textContent = thisSessionId;
  document.getElementById("sessionIdInfo").textContent = thisSessionId;
  document.getElementById("sessionIdCurrent").textContent = thisSessionId;
  document.getElementById("sessionInfoId").textContent = thisSessionId;
}

function setCurrentSessionPasswordText(password) {
  const text = document.getElementById("sessionPasswordCurrent");
  if (password === null) {
    text.textContent = "There is currently no password set on this session.";
  } else {
    text.innerHTML = `Current password: <span class="clickToCopy lightBox" title="Copy" id="currentPassword">${password}</span>`;
    const current = document.getElementById("currentPassword");
    current.onclick = (event) => copyText(event, current.textContent);
  }
}

function setSessionPassword() {
  sendMessage({
    type: "session-password",
    password: document.getElementById("sessionPasswordNew").value
  });
}

function enterPassword() {
  sendMessage({
    type: "enter-password",
    password: document.getElementById("enterSessionPassword").value,
    id: document.getElementById("enterSessionPasswordId").textContent
  });
}

function saveUserSettings() {
  const name = document.getElementById("userNameInput").value;
  if (name !== clients.get(thisClientId).name) {
    sendMessage({
      type: "user-name",
      name: name,
      clientId: thisClientId
    });
    document.getElementById("userName").textContent = name;
  }
  modalClose("userModal");
}

function elementFitHeight(el) {
  el.style.height = 0;
  el.style.height = el.scrollHeight + "px";
}

function chatSend() {
  const input = document.getElementById("chatInput");
  const msg = input.value;
  const indexSpace = msg.indexOf(" ");
  if (msg.trim() === "" || (msg.slice(0, 3) === "to:" && (msg.slice(indexSpace).trim() === "" || indexSpace === -1))) return;
  input.value = "";
  const box = document.getElementById("chatMessages");
  const isAtBottom = box.scrollTop == box.scrollHeight - box.clientHeight;
  elementFitHeight(input);
  if (isAtBottom) box.scrollTop = box.scrollHeight - box.clientHeight;
  sendMessage({
    type: "chat-message",
    message: msg,
    clientId: thisClientId
  });
}
function fullDate(date) {
  var month = MONTHS[date.getMonth()],
      day = date.getDate(),
      year = date.getFullYear(),
      hours = date.getHours(),
      amPm = hours < 12 ? "AM" : "PM",
      minutes = ("0" + date.getMinutes()).substr(-2),
      seconds = ("0" + date.getSeconds()).substr(-2);
  hours %= 12;
  hours = hours ? hours : 12;
  return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds} ${amPm}`;
}
function addMessageTo(id) {
  const input = document.getElementById("chatInput");
  if (input.value.slice(0, 3) === "to:") {
    // "to:" at beginning of message, already has list
    const split = input.value.split(" ");
    // List of IDs already contains ID
    if (split[0].slice(3).split(",").includes(id)) return;
    const toLen = split[0].length;
    // Add to the existing list: A comma if there is already an ID in it, the new ID, space and the rest of the message
    input.value = input.value.slice(0, toLen) + (toLen === 3 ? "" : ",") + id + " " + (input.value.slice(toLen + 1) || "");
  } else {
    // Message doesn't have a "to:" list yet, add one;
    input.value = `to:${id} ` + (input.value.slice(0, 1) === " " ? input.value.slice(1) : input.value);
  }
  elementFitHeight(input);
  input.focus();
}
function addChatMessage(msg) {
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
  // Quirk that is actually wanted: When chatBox is not displayed, its dimensions are all 0, so isAtBottom is true
  var bubble;
  const last = box.children[box.children.length - 1];
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
    name.addEventListener("click", () => addMessageTo(client.id));
    nameRow.appendChild(name);
    const time = document.createElement("span");
    time.classList.add("chatMessageTime");
    const timestamp = new Date(msg.timestamp);
    var hours = timestamp.getHours();
    const amPm = hours < 12 ? "AM" : "PM";
    hours %= 12;
    hours = hours ? hours : 12;
    time.textContent = `${hours}:${("0" + timestamp.getMinutes()).slice(-2)} ${amPm}`;
    time.title = fullDate(timestamp);
    nameRow.appendChild(time);
    if (msg.priv) {
      bubble.classList.add("chatMessagePrivate", "chatMessagePrivate-" + msg.priv);
      const privateText = document.createElement("span");
      privateText.classList.add("chatPrivateText");
      privateText.textContent = "Private";
      writePrivateTextTitle(privateText, msg.priv);
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
  msgText.title = fullDate(new Date(msg.timestamp));
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
    const chatBox = document.getElementById("chatBox");
    const tempClassName = chatBox.className;
    chatBox.classList.remove("displayNone");
    box.scrollTop = box.scrollHeight - box.clientHeight;
    chatBox.className = tempClassName;
  }
}
function writePrivateTextTitle(el, ids) {
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
}
function toggleChatBox() {
  if (!document.getElementById("chatBox").classList.toggle("displayNone")) openChatBox();
}
function openChatBox() {
  const chatNew = document.getElementById("chatNew");
  chatNew.style.width = 0;
  chatNew.style.height = 0;
  chatNew.style.top = "4px";
  chatNew.style.right = "4px";
  document.getElementById("chatInput").focus();
}

// Tell the user if their browser does not support WebSockets
if (!("WebSocket" in window)) modalOpen("noWsModal");

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
  info.textContent = "You may be waking up the server. It goes to sleep every once in a while. Hang on tight!"
  document.getElementById("connectionInfo").appendChild(info);
}, 3000);

// Create WebSocket
const socket = new WebSocket(WSS_URL);

// Show error modal on error
socket.onerror = () => {
  modalOpen("errorModal");
  leaveSession();
};
socket.onopen = () => {
  document.getElementById("connectionInfo").style.display = "none";
  document.getElementById("connectionInfoWait").style.display = "none";
  document.getElementById("menuOptionsContainer").style.display = "block";
  clearInterval(connectionWait);
  clearTimeout(wakingUp);
  const info = document.getElementById("wakingUpInfo");
  if (info) info.remove();
  
  // Tell the server if there is a session ID in the URL hash
  if (location.hash !== "") {
    sendMessage({
      type: "url-session",
      id: decodeURIComponent(location.hash.slice(1))
    });
  }
  
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
          pos: {
            x: mouseMoved.x,
            y: mouseMoved.y
          },
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
  leaveSession();
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
  modalOpen("disconnectModal");
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
      clientStrokes.get(data.clientId).points.push({
        x: data.x,
        y: data.y
      });
      drawClientStroke(data.clientId);
      break;
    }
    // Another user has ended their stroke
    case "end-stroke": {
      commitStroke(
        clientCanvasses.get(data.clientId),
        clientStrokes.get(data.clientId)
      );
      clientStrokes.delete(data.clientId);
      break;
    }
    // Another user has undone/redone an action
    case "undo": {
      undo();
      break;
    }
    case "redo": {
      redo();
      break;
    }
    // Another user has used the flood fill tool
    case "fill": {
      fill(data.x, data.y, data.colour, data.threshold, data.opacity, data.compOp, data.fillBy, data.changeAlpha);
      break;
    }
    // Another user has cleared the canvas
    case "clear": {
      sessionCtx.clearRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      addToUndo({
        type: "clear"
      });
      break;
    }
    case "clear-blank": {
      sessionCtx.fillStyle = BLANK_COLOUR;
      sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      addToUndo({
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
    case "clear-selection": {
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
      drawSelection(clientCanvasses.get(data.clientId).getContext("2d"), sel, false, false);
      break;
    }
    case "selection-copy": {
      copySelectedPixels(clientCanvasses.get(data.clientId).getContext("2d"), clientSelections.get(data.clientId));
      break;
    }
    case "selection-cut": {
      cutSelectedPixels(clientCanvasses.get(data.clientId).getContext("2d"), clientSelections.get(data.clientId), data.colour);
      break;
    }
    case "selection-paste": {
      pasteSelectedPixels(clientSelections.get(data.clientId));
      break;
    }
    case "selection-clear": {
      clearSelectedPixels(clientSelections.get(data.clientId), data.colour);
      break;
    }
    case "line": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      drawLine(data.line, clientCtx);
      break;
    }
    case "commit-line": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      drawLine(data.line, sessionCtx, false);
      addToUndo({
        type: "line",
        line: data.line
      });
      break;
    }
    case "rect": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      drawRect(data.rect, clientCtx);
      break;
    }
    case "commit-rect": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      drawRect(data.rect, sessionCtx, false);
      addToUndo({
        type: "rect",
        rect: data.rect
      });
      break;
    }
    case "ellipse": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      drawEllipse(data.ellipse, clientCtx);
      break;
    }
    case "commit-ellipse": {
      const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
      clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
      drawEllipse(data.ellipse, sessionCtx, false);
      addToUndo({
        type: "ellipse",
        ellipse: data.ellipse
      });
      break;
    }
    case "user-name": {
      clients.get(data.clientId).name = data.name;
      [...document.getElementsByClassName("chatMessageName-" + data.clientId)].forEach((name) => name.textContent = data.name);
      [...document.getElementsByClassName("chatPrivateText-" + data.clientId)].forEach((text) => {
        writePrivateTextTitle(text, [...text.className.matchAll(/chatPrivateText-([a-z\d]{4})/g)].map((name) => name[1]));
      })
      updateSessionInfoClientTable();
      break;
    }
    case "chat-message": {
      addChatMessage(data);
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
        undoActions: undoActions,
        redoActions: redoActions,
        clientId: data.clientId
      });
      break;
    }
    // The server has recieved a copy of the canvas from the first user
    case "response-canvas": {
      setupCanvas(data);
      break;
    }
    // A new user has joined the session
    case "user-joined": {
      addUsers([data.client], data.total);
      break;
    }
    // A user has left the session
    case "user-left": {
      removeUsers(data.client, data.total);
      break;
    }
    // Another user has moved their mouse
    case "mouse-move": {
      const cursor = document.getElementById("cursorIcon-" + data.clientId);
      if (data.outside) {
        cursor.style.display = "none";
      } else {
        const x = (data.pos.x * scale) + (sessionCanvas.offsetLeft + (sessionCanvas.clientLeft * scale)) - canvasContainer.scrollLeft;
        const y = (data.pos.y * scale) + (sessionCanvas.offsetTop + (sessionCanvas.clientTop * scale)) - canvasContainer.scrollTop;
        cursor.style.left = x + "px";
        cursor.style.top = y + "px";
        cursor.style.display = "block";
      }
      break;
    }
    case "password-set": {
      if (data.clientId === thisClientId) modalClose("setSessionPasswordModal");
      setCurrentSessionPasswordText(data.password);
      break;
    }
    case "enter-password": {
      document.getElementById("enterSessionPasswordId").textContent = data.id;
      modalOpen("enterSessionPasswordModal");
      break;
    }
    case "wrong-password": {
      document.getElementById("sessionWrongPassword").textContent = data.password;
      document.getElementById("sessionWrongPasswordId").textContent = data.id;
      modalOpen("sessionWrongPasswordModal");
      break;
    }
    // User has joined the session successfully
    case "session-joined": {
      modalClose("enterSessionPasswordModal");
      
      document.getElementById("menuScreen").style.display = "none";
      document.getElementById("drawScreen").style.display = "grid";
      if (data.total !== 1) modalOpen("retrieveModal");
      setSessionId(data.id);
      setCurrentSessionPasswordText(data.password);
      clearUndoActions();
      clearRedoActions();
      
      // Set up tool variables and inputs
      TOOL_SETTINGS_SLIDERS.forEach((input) => {
        const slider = document.getElementById(input.id + "Input");
        setSliderValue(input.id, input.defaultVal, false);
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
      
      const chatBox = document.getElementById("chatBox");
      const chatInput = document.getElementById("chatInput");
      chatInput.value = "";
      chatBox.classList.remove("displayNone");
      elementFitHeight(chatInput);
      chatBox.classList.add("displayNone");
      
      // Set canvas size
      sessionCanvas.width = CANVAS_WIDTH;
      sessionCanvas.height = CANVAS_HEIGHT;
      thisCanvas.width = CANVAS_WIDTH;
      thisCanvas.height = CANVAS_HEIGHT;
      // Resize if too big
      setCanvasScale(DEFAULT_SCALE);
      scaleCanvasToFit(false);
      // Fill canvas with white
      sessionCtx.fillStyle = BLANK_COLOUR;
      sessionCtx.fillRect(0, 0, sessionCanvas.width, sessionCanvas.height);
      
      addUsers(data.clients, data.total);
      
      break;
    }
    // The session the user has tried to join does not exist
    case "session-no-exist": {
      modalClose("enterSessionPasswordModal");
      document.getElementById("sessionNoExist").textContent = data.id;
      modalOpen("sessionNoExistModal");
      break;
    }
    // The session the user has tried to create already exists
    case "session-already-exist": {
      document.getElementById("sessionAlreadyExist").textContent = data.id;
      modalOpen("sessionAlreadyExistModal");
      break;
    }
    case "leave-session": {
      sessionLeft();
      break;
    }
    case "session-id-changed": {
      setSessionId(data.id);
      if (data.clientId === thisClientId) {
        modalClose("changeSessionIdModal");
        document.getElementById("sessionIdChanged").textContent = data.id;
        modalOpen("sessionIdChangedModal");
      }
      break;
    }
    case "session-has-id": {
      document.getElementById("sessionHasId").textContent = data.id;
      modalOpen("sessionHasIdModal");
      break;
    }
    // An unknown message has been sent from the server. This should never
    // happen!!!
    default: {
      console.error("Unknown message!", data);
      return;
    }
  }
};

// Set up events that end strokes for all of the page in case it happens outside
// of the canvas
const html = document.getElementById("html");
html.addEventListener("pointermove", mouseMove, { passive: false });
html.addEventListener("pointerup", clearMouseHold, { passive: false });
html.addEventListener("pointercancel", clearMouseHold, { passive: false });
html.addEventListener("pointerleave", clearMouseHold, { passive: false });
html.addEventListener("contextmenu", (event) => {
  const tagName = event.target.tagName;
  if (tagName === "A" || tagName === "INPUT" || tagName === "TEXTAREA") return;
  event.preventDefault();
  event.stopPropagation();
});
html.addEventListener("click", (event) => {
  if (event.target.tagName == "LI") return;
  const selected = document.getElementsByClassName("menuSelected");
  for (var i = 0; i < selected.length; i++) {
    selected[i].classList.remove("menuSelected");
  }
});

html.addEventListener("keydown", (event) => {
  if (event.target.tagName !== "BODY") {
    if (!event.ctrlKey) {
      switch (event.key) {
        case "F1": {
          modalOpen("helpModal");
          break;
        }
        case "Escape": {
          toggleChatBox();
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
        modalOpen("helpModal");
        break;
      }
      case "1": {
        setCanvasScale(1);
        break;
      }
      case "2": {
        setCanvasScale(2);
        break;
      }
      case "3": {
        setCanvasScale(4);
        break;
      }
      case "4": {
        setCanvasScale(8);
        break;
      }
      case "5": {
        setCanvasScale(16);
        break;
      }
      case "=": {
        zoom(0.1);
        break;
      }
      case "-": {
        zoom(-0.1);
        break;
      }
      case "Escape": {
        toggleChatBox();
        break;
      }
      default: return;
    }
  } else {
    switch (event.key) {
      case "z": {
        doUndo();
        break;
      }
      case "Z":
      case "y": {
        doRedo();
        break;
      }
      case "c": {
        if (tool !== RECT_SELECT_TOOL) return;
        selectCopy();
        break;
      }
      case "x": {
        if (tool !== RECT_SELECT_TOOL) return;
        selectCut();
        break;
      }
      case "v": {
        if (tool !== RECT_SELECT_TOOL) return;
        selectPaste();
        break;
      }
      default: return;
    }
  }
  event.preventDefault();
});

html.addEventListener("keydown", (event) => {
  if (event.key === "Control") ctrlKey = true;
});
html.addEventListener("keyup", (event) => {
  if (event.key === "Control") ctrlKey = false;
});

var upTimeout, downTimeout;
html.addEventListener("pointerup", () => {
  clearTimeout(upTimeout);
  clearTimeout(downTimeout);
});

// Set up events for the canvas, but not the move or ending ones (see html event
// listeners)
const canvasContainer = document.getElementById("canvasContainer");
canvasContainer.addEventListener("pointerdown", mouseHold);
canvasContainer.addEventListener("wheel", (event) => {
  if (!ctrlKey) return;
  event.preventDefault();
  const delta = Math.sign(event.deltaY) * -0.25;
  zoom(delta);
});

// Set up inputs
document.getElementById("createSessionBtn").addEventListener("click", createSession);
document.getElementById("joinSessionBtn").addEventListener("click", joinSession);

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
    setSliderValue(input.id, value);
  });
  const up = document.getElementById(input.id + "ValueUp");
  const down = document.getElementById(input.id + "ValueDown");
  up.addEventListener("pointerdown", (event) => {
    sliderValUpDown(input.id, true);
    upTimeout = setTimeout(function repeatUp() {
      sliderValUpDown(input.id, true);
      upTimeout = setTimeout(() => repeatUp(), 30);
    }, 300);
    event.stopPropagation();
  });
  down.addEventListener("pointerdown", (event) => {
    sliderValUpDown(input.id, false);
    downTimeout = setTimeout(function repeatDown() {
      sliderValUpDown(input.id, false);
      downTimeout = setTimeout(() => repeatDown(), 30);
    }, 300);
    event.stopPropagation();
  });
  slider.addEventListener("pointerdown", (event) => {
    currentInput = input.id;
    updateSliderInput(event);
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

document.getElementById("choosePicture").addEventListener("change", importPicture);
document.getElementById("chooseCanvasFile").addEventListener("change", importCanvas);

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
document.getElementById("fileSaveBtn").addEventListener("click", saveCanvas);
document.getElementById("fileOpenBtn").addEventListener("click", openCanvas);
document.getElementById("fileDownloadBtn").addEventListener("click", download);
document.getElementById("fileImportBtn").addEventListener("click", selectImport);
document.getElementById("editUndoBtn").addEventListener("click", doUndo);
document.getElementById("editRedoBtn").addEventListener("click", doRedo);
document.getElementById("editClearBtn").addEventListener("click", clearCanvasBlank);
document.getElementById("editClearTransparentBtn").addEventListener("click", clearCanvas);
document.getElementById("editResizeBtn").addEventListener("click", chooseCanvasSize);
document.getElementById("viewResetScaleBtn").addEventListener("click", () => setCanvasScale(DEFAULT_SCALE));
document.getElementById("viewFitScaleBtn").addEventListener("click", scaleCanvasToFit);
document.getElementById("sessionInfoBtn").addEventListener("click", () => modalOpen("sessionInfoModal"));
document.getElementById("sessionChangeIdBtn").addEventListener("click", () => {
  document.getElementById("sessionIdNew").value = thisSessionId;
  modalOpen("changeSessionIdModal");
});
document.getElementById("sessionSetPasswordBtn").addEventListener("click", () => modalOpen("setSessionPasswordModal"));
document.getElementById("sessionLeaveBtn").addEventListener("click", leaveSession);
document.getElementById("helpHelpBtn").addEventListener("click", () => modalOpen("helpModal"));
document.getElementById("helpInfoBtn").addEventListener("click", () => modalOpen("infoModal"));
document.getElementById("helpBtn").addEventListener("click", () => modalOpen("helpModal"));
document.getElementById("infoBtn").addEventListener("click", () => modalOpen("infoModal"));
document.getElementById("userBtn").addEventListener("click", () => {
  document.getElementById("userNameInput").value = clients.get(thisClientId).name || "";
  modalOpen("userModal");
});
document.getElementById("chatBtn").addEventListener("click", toggleChatBox);
document.getElementById("chatXBtn").addEventListener("click", () => {
  document.getElementById("chatBox").classList.add("displayNone");
});

const chatInput = document.getElementById("chatInput");
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    chatSend();
    event.preventDefault();
  }
});
chatInput.addEventListener("input", () => {
  const box = document.getElementById("chatMessages");
  const isAtBottom = box.scrollTop == box.scrollHeight - box.clientHeight;
  elementFitHeight(chatInput);
  if (isAtBottom) box.scrollTop = box.scrollHeight - box.clientHeight;
});
document.getElementById("chatSendBtn").addEventListener("click", chatSend);

document.getElementById("undoBtn").addEventListener("click", doUndo);
document.getElementById("redoBtn").addEventListener("click", doRedo);
const clearBtn = document.getElementById("clearBtn");
clearBtn.addEventListener("click", clearCanvasBlank);
clearBtn.addEventListener("dblclick", clearCanvas);
document.getElementById("resetScaleBtn").addEventListener("click", () => setCanvasScale(DEFAULT_SCALE));
document.getElementById("fitScaleBtn").addEventListener("click", scaleCanvasToFit);

document.getElementById("leaveBtn").addEventListener("click", leaveSession);

[...document.getElementsByClassName("clickToCopy")].forEach((el) => {
  el.addEventListener("click", (event) => copyText(event, el.textContent));
});
document.getElementById("allPingsLink").addEventListener("click", () => modalOpen("allPingsModal"));

document.getElementById("allPingsModalDoneBtn").addEventListener("click", () => modalClose("allPingsModal"));

document.getElementById("resizeModalOkBtn").addEventListener("click", resizeCanvas);
document.getElementById("resizeModalCancelBtn").addEventListener("click", () => modalClose("canvasResizeModal"));
document.getElementById("canvasResizeModal").addEventListener("keydown", () => {
  if (event.key === "Enter") {
    document.getElementById("resizeModalOkBtn").click();
  }
});

document.getElementById("helpModalDoneBtn").addEventListener("click", () => modalClose("helpModal"));
document.getElementById("infoModalDoneBtn").addEventListener("click", () => modalClose("infoModal"));

document.getElementById("sessionInfoModalDoneBtn").addEventListener("click", () => modalClose("sessionInfoModal"));

document.getElementById("sessionIdModalChangeBtn").addEventListener("click", changeSessionId);
document.getElementById("sessionIdModalCancelBtn").addEventListener("click", () => modalClose("changeSessionIdModal"));
document.getElementById("sessionIdChangedModalOkBtn").addEventListener("click", () => modalClose("sessionIdChangedModal"));
document.getElementById("sessionHasIdModalOkBtn").addEventListener("click", () => modalClose("sessionHasIdModal"));

document.getElementById("setSessionPasswordModalRemoveBtn").addEventListener("click", () => {
  sendMessage({
    type: "session-password",
    password: null
  });
});
document.getElementById("setSessionPasswordModalSetBtn").addEventListener("click", setSessionPassword);
document.getElementById("setSessionPasswordModalCancelBtn").addEventListener("click", () => modalClose("setSessionPasswordModal"));

document.getElementById("enterSessionPasswordModalJoinBtn").addEventListener("click", enterPassword);
document.getElementById("enterSessionPasswordModalCancelBtn").addEventListener("click", () => modalClose("enterSessionPasswordModal"));
document.getElementById("sessionWrongPasswordModalOkBtn").addEventListener("click", () => modalClose("sessionWrongPasswordModal"));

document.getElementById("appInfoLink").addEventListener("click", () => modalOpen("appInfoModal"));
document.getElementById("appInfoModalDoneBtn").addEventListener("click", () => modalClose("appInfoModal"));

document.getElementById("errorModalOkBtn").addEventListener("click", () => modalClose("errorModal"));
document.getElementById("disconnectModalOkBtn").addEventListener("click", () => modalClose("disconnectModal"));
document.getElementById("sessionNoExistModalOkBtn").addEventListener("click", () => modalClose("sessionNoExistModal"));
document.getElementById("sessionAlreadyExistModalOkBtn").addEventListener("click", () => modalClose("sessionAlreadyExistModal"));

document.getElementById("userModalSaveBtn").addEventListener("click", saveUserSettings);
document.getElementById("userModalCancelBtn").addEventListener("click", () => modalClose("userModal"));

document.getElementById("canvasScale").addEventListener("input", scaleCanvas);

document.getElementById("selectCopyBtn").addEventListener("click", selectCopy);
document.getElementById("selectCutBtn").addEventListener("click", selectCut);
document.getElementById("selectPasteBtn").addEventListener("click", selectPaste);
document.getElementById("selectClearBtn").addEventListener("click", () => {
  sendMessage({
    type: "selection-clear",
    colour: penColours[1],
    clientId: thisClientId
  });
  clearSelectedPixels(currentAction.data, penColours[1]);
});

window.addEventListener("beforeunload", () => {
  socket.onclose = leaveSession;
  socket.close(1000);
});

})();
