//------------------------------------------------------------------------------
// Web Draw
// A little real-time online drawing program.
//------------------------------------------------------------------------------

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
  // Keyboard shortcuts that can be used anywhere
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
  }
  // Keyboard shortcuts that can only be used when not currently typing or on the canvas
  const tagName = event.target.tagName;
  if (tagName !== "INPUT" && tagName !== "TEXTAREA" && !event.target.isContentEditable && Modal.index === 99) {
    if (!event.ctrlKey) {
      switch (event.key) {
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
