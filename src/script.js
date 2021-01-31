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

// Values of tool setting <select>s
// Pen stroke and line cap options
const CAPS = [
  "round",
  "butt",
  "square"
];
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
var penColours = Colour.DEFAULTS.slice();
var currentPen = 0;
var tool = "pen";

var clients = {};

// Whether mouse has moved or not since last update was sent to server
var mouseMoved = {
  moved: false,
  outside: false
};
// Most recent custom colours
var customColours = [];

// Session canvas (permanent)
const sessionCanvas = document.createElement("canvas");
const sessionCtx = sessionCanvas.getContext("2d");

// Check if a point is within an area
function isPointInside(x, y, rect) {
  return (rect.x < x && x < rect.x + rect.width &&
          rect.y < y && y < rect.y + rect.height);
}

// Tell the user if their browser does not support WebSockets
if (!("WebSocket" in window)) Modal.open("noWsModal");

const waitConnect = () => {
  const wait = document.getElementById("connectionInfoWait");
  if (wait.textContent.length === 3) wait.textContent = "";
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

Client.init();

Tools.loadToolSettings(tool);

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
  if (event.target.tagName === "LI") return;
  const selected = document.getElementsByClassName("menuSelected");
  for (var i = 0; i < selected.length; i++) {
    selected[i].classList.remove("menuSelected");
  }
});

document.addEventListener("keydown", (event) => {
  // Keyboard shortcuts that can only be used when not currently typing or on the canvas
  const tagName = event.target.tagName;
  notTyping: if (tagName !== "INPUT" && tagName !== "TEXTAREA" && !event.target.isContentEditable && Modal.index === 100) {
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
        default: break notTyping;
      }
      event.preventDefault();
      return;
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
          if (tool !== "select") return;
          Selection.doCopy();
          break;
        }
        case "x": {
          if (tool !== "select") return;
          Selection.doCut();
          break;
        }
        case "v": {
          if (tool !== "select") return;
          Selection.doPaste();
          break;
        }
        default: break notTyping;
      }
      event.preventDefault();
      return;
    }
  }
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
    event.preventDefault();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Control") ctrlKey = true;
});
document.addEventListener("keyup", (event) => {
  if (event.key === "Control") ctrlKey = false;
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

const colourPicker = document.getElementById("colourPicker");
colourPicker.addEventListener("input", (event) => {
  Colour.update(currentPen, event.target.value);
});
colourPicker.addEventListener("change", (event) => {
  Colour.change(currentPen, event.target.value);
});

const quickColourSelect = document.getElementById("quickColourSelect");
quickColourSelect.addEventListener("click", (event) => { event.preventDefault(); });
quickColourSelect.addEventListener("contextmenu", (event) => { event.preventDefault(); });

document.getElementById("choosePicture").addEventListener("change", (event) => Canvas.importPicture(event));
document.getElementById("chooseCanvasFile").addEventListener("change", (event) => Canvas.open(event));

const penColourBoxes = document.getElementsByClassName("penColour");
for (let i = 0; i < penColourBoxes.length; i++) {
  const penColourBox = penColourBoxes[i];
  penColourBox.addEventListener("click", () => {
    currentPen = i;
    Colour.openPicker(i);
  });
  penColourBox.addEventListener("contextmenu", () => {
    currentPen = i;
    Colour.openPicker(i);
  });
}
const penColourValues = document.getElementsByClassName("penColourValue");
for (let i = 0; i < penColourValues.length; i++) {
  penColourValues[i].addEventListener("keydown", (event) => {
    if (event.key === "Enter") Colour.changeWithValue(i, event);
  });
}
for (const toolName of Tools.NAMES) {
  document.getElementById(toolName + "Btn").addEventListener("click", () => switchTool(toolName));
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
document.getElementById("fileOpenBtn").addEventListener("click", () => {
  const filePicker = document.getElementById("chooseCanvasFile");
  filePicker.click();
});
document.getElementById("fileExportBtn").addEventListener("click", () => Canvas.export());
document.getElementById("fileImportBtn").addEventListener("click", () => {
  const filePicker = document.getElementById("choosePicture");
  filePicker.click();
});
document.getElementById("editUndoBtn").addEventListener("click", () => ActionHistory.doUndo());
document.getElementById("editRedoBtn").addEventListener("click", () => ActionHistory.doRedo());
document.getElementById("editClearBtn").addEventListener("click", () => Canvas.clearBlank());
document.getElementById("editClearTransparentBtn").addEventListener("click", () => Canvas.clear());
document.getElementById("editSettingsBtn").addEventListener("click", () => Modal.open("settingsModal"));
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
  document.getElementById("userNameInput").value = clients[Client.id].name || "";
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
  const isAtBottom = box.scrollTop === box.scrollHeight - box.clientHeight;
  elementFitHeight(Chat.input);
  if (isAtBottom) box.scrollTop = box.scrollHeight - box.clientHeight;
});
document.getElementById("chatSendBtn").addEventListener("click", () => Chat.send());

document.getElementById("undoBtn").addEventListener("click", () => ActionHistory.doUndo());
document.getElementById("redoBtn").addEventListener("click", () => ActionHistory.doRedo());
const clearBtn = document.getElementById("clearBtn");
clearBtn.addEventListener("click", () => Canvas.clearBlank());
clearBtn.addEventListener("dblclick", () => Canvas.clear());
document.getElementById("resetZoomBtn").addEventListener("click", () => Canvas.setZoom(Canvas.DEFAULT_ZOOM));
document.getElementById("fitZoomBtn").addEventListener("click", () => Canvas.zoomToWindow("fit"));

document.getElementById("shareLinkBtn").addEventListener("click", () => Modal.open("shareSessionLinkModal"));
document.getElementById("leaveBtn").addEventListener("click", () => Session.leave());

[...document.getElementsByClassName("clickToCopy")].forEach((el) => {
  el.addEventListener("click", (event) => copyText(el.textContent, event));
});
document.getElementById("allPingsLink").addEventListener("click", () => Modal.open("allPingsModal"));

document.getElementById("allPingsModalDoneBtn").addEventListener("click", () => Modal.close("allPingsModal"));

const resizeWidth = document.getElementById("canvasResizeWidth");
const resizeHeight = document.getElementById("canvasResizeHeight");
const offsetX = document.getElementById("canvasResizeOffsetX");
const offsetY = document.getElementById("canvasResizeOffsetY");
resizeWidth.addEventListener("input", () => {
  const delta = resizeWidth.value - sessionCanvas.width;
  offsetX.min = Math.min(delta, 0);
  offsetX.max = Math.max(delta, 0);
  offsetX.value = Math.max(Math.min(offsetX.value, offsetX.max), offsetX.min);
});
resizeHeight.addEventListener("input", () => {
  const delta = resizeHeight.value - sessionCanvas.height;
  offsetY.min = Math.min(delta, 0);
  offsetY.max = Math.max(delta, 0);
  offsetY.value = Math.max(Math.min(offsetY.value, offsetY.max), offsetY.min);
});
document.getElementById("editResizeBtn").addEventListener("click", () => {
  resizeWidth.value = sessionCanvas.width;
  resizeHeight.value = sessionCanvas.height;
  offsetX.min = 0;
  offsetX.max = 0;
  offsetX.value = 0;
  offsetY.min = 0;
  offsetY.max = 0;
  offsetY.value = 0;
  Modal.open("canvasResizeModal");
});
document.getElementById("canvasResizeOffsetCentre").addEventListener("click", () => {
  offsetX.value = Math.round((resizeWidth.value - sessionCanvas.width) / 2);
  offsetY.value = Math.round((resizeHeight.value - sessionCanvas.height) / 2);
});
const resizeFill = document.getElementById("canvasResizeFill");
resizeFill.value = 1;
document.getElementById("resizeModalResizeBtn").addEventListener("click", () => {
  Modal.close("canvasResizeModal");
  var bgColour = null;
  switch (parseInt(resizeFill.value)) {
    case 0: {
      bgColour = penColours[0];
      break;
    }
    case 1: {
      bgColour = penColours[1];
      break;
    }
    case 2: {
      bgColour = "#ffffff";
      break;
    }
    // 3: Transparency = null
  }
  console.log(bgColour);
  const options = {
    width: document.getElementById("canvasResizeWidth").value,
    height: document.getElementById("canvasResizeHeight").value,
    x: document.getElementById("canvasResizeOffsetX").value,
    y: document.getElementById("canvasResizeOffsetY").value,
    colour: bgColour
  };
  Client.sendMessage({
    type: "resize-canvas",
    options: options
  });
  Canvas.resize(options);
});
document.getElementById("resizeModalCancelBtn").addEventListener("click", () => Modal.close("canvasResizeModal"));

document.getElementById("settingsModalDoneBtn").addEventListener("click", () => Modal.close("settingsModal"));
document.getElementById("sendMouseMovements").addEventListener("input", (event) => Client.setSendMouse(event.target.checked));
document.getElementById("receiveMouseMovements").addEventListener("input", (event) => Client.setReceiveMouse(event.target.checked));

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
  Client.sendMessage({
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
  Client.sendMessage({
    type: "selection-clear",
    colour: penColours[1],
    clientId: Client.id
  });
  Selection.clear(clients[Client.id].action.data, penColours[1]);
});

window.addEventListener("beforeunload", () => {
  Client.socket.onclose = () => Session.leave();
  Client.socket.close(1000);
});
