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

// Tools available to the user
const PEN_TOOL = 0, FILL_TOOL = 1, COLOUR_PICKER_TOOL = 2, RECT_SELECT_TOOL = 3,
      LINE_TOOL = 4, RECT_TOOL = 5, ELLIPSE_TOOL = 6;
const TOOLS = ["pen", "fill", "colourPicker", "select", "line", "rect", "ellipse"];
const NUM_TOOLS = TOOLS.length;

// Handle mousedown on canvas
function mouseHold(event) {
  if (event.target.tagName !== "CANVAS") return;
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
  const point = Canvas.getCursorPos(event);
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
  
  const size         = parseInt(document.getElementById("penWidthInput").dataset.value, 10);
  const opacity      = parseFloat(document.getElementById("opacityInput").dataset.value) / 100;
  const compOp       = parseInt(document.getElementById("compositeSelect").value, 10);
  const shapeOutline = document.getElementById("shapeOutline").checked;
  const shapeFill    = document.getElementById("shapeFill").checked;
  const caps         = parseInt(document.getElementById("lineCapSelect").value);
  
  if (tool !== RECT_SELECT_TOOL) Selection.remove();
  
  switch (tool) {
    case PEN_TOOL: {
      currentAction = {
        type: "stroke",
        data: {
          points: [],
          colour: penColours[currentPen],
          size: size,
          caps: caps,
          opacity: opacity,
          compOp: compOp
        }
      };
      Client.sendMessage({
        type: "start-stroke",
        clientId: Client.id,
        action: currentAction
      });
      Pen.draw(point.x, point.y);
      break;
    }
    case FILL_TOOL: {
      const thresholdInput = document.getElementById("fillThresholdInput");
      var threshold = parseInt(thresholdInput.dataset.value, 10);
      const fillColour = penColours[currentPen];
      const fillBy = parseInt(document.getElementById("fillBySelect").value, 10);
      const changeAlpha = document.getElementById("fillChangeAlpha").checked;
      Client.sendMessage({
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
      Client.sendMessage({
        type: "create-selection",
        clientId: Client.id
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
          width: size,
          caps: caps,
          opacity: opacity,
          compOp: compOp
        }
      };
      break;
    }
    case RECT_TOOL: {
      if (!shapeOutline && !shapeFill) break;
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
          lineWidth: size,
          opacity: opacity,
          compOp: compOp,
          outline: shapeOutline,
          fill: shapeFill
        }
      };
      break;
    }
    case ELLIPSE_TOOL: {
      if (!shapeOutline && !shapeFill) break;
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
          lineWidth: size,
          opacity: opacity,
          compOp: compOp,
          outline: shapeOutline,
          fill: shapeFill
        }
      };
      break;
    }
  }
}
// Handle mousemove (prepare update and add point to stroke if drawing)
function mouseMove(event) {
  const point = Canvas.getCursorPos(event);
  document.getElementById("cursorPos").textContent = `${point.x}, ${point.y}`;
  switch (currentAction.type) {
    case "stroke": {
      event.preventDefault();
      Pen.draw(point.x, point.y);
      break;
    }
    case "line": {
      event.preventDefault();
      currentAction.data.x1 = point.x, currentAction.data.y1 = point.y;
      Client.sendMessage({
        type: "line",
        clientId: Client.id,
        line: currentAction.data
      });
      Line.draw(currentAction.data, thisCtx);
      break;
    }
    case "rect": {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      Client.sendMessage({
        type: "rect",
        clientId: Client.id,
        rect: currentAction.data
      });
      Rect.draw(currentAction.data, thisCtx);
      break;
    }
    case "ellipse": {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      Client.sendMessage({
        type: "ellipse",
        clientId: Client.id,
        ellipse: currentAction.data
      });
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
  mouseMoved.moved = true;
  if (event.target.tagName != "CANVAS") {
    mouseMoved.x = -1;
  } else {
    mouseMoved.x = point.x;
    mouseMoved.y = point.y;
  }
}
// Handle mouseup
function clearMouseHold(event) {
  switch (currentAction.type) {
    case "stroke": {
      event.preventDefault();
      const point = Canvas.getCursorPos(event);
      Pen.draw(point.x, point.y);
      Client.sendMessage({
        type: "end-stroke",
        clientId: Client.id
      });
      Pen.commitStroke(thisCanvas, currentAction.data);
      break;
    }
    case "line": {
      event.preventDefault();
      Client.sendMessage({
        type: "commit-line",
        line: currentAction.data,
        clientId: Client.id
      });
      Canvas.update(thisCanvas, currentAction.data.compOp, true);
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      ActionHistory.addToUndo({
        type: "line",
        line: currentAction.data
      });
      break;
    }
    case "rect": {
      event.preventDefault();
      Client.sendMessage({
        type: "commit-rect",
        rect: currentAction.data,
        clientId: Client.id
      });
      Canvas.update(thisCanvas, currentAction.data.compOp, true);
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
      ActionHistory.addToUndo({
        type: "rect",
        rect: currentAction.data
      });
      break;
    }
    case "ellipse": {
      event.preventDefault();
      Client.sendMessage({
        type: "commit-ellipse",
        ellipse: currentAction.data,
        clientId: Client.id
      });
      Canvas.update(thisCanvas, currentAction.data.compOp, true);
      thisCtx.clearRect(0, 0, thisCanvas.width, thisCanvas.height);
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
  currentAction.type = null;
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
