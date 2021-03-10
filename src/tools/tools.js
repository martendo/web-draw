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

const Tools = {
  NAMES: [
    "pen",
    "fill",
    "colourPicker",
    "select",
    "line",
    "rect",
    "ellipse"
  ],
  
  // `value`: Value goes in `value` attribute (select)
  // `slider`: Set with `Slider.setValue()`, get with `data-value` attribute (slider)
  // `checked`: Use `checked` flag (checkbox)
  settings: {
    "pen": {
      "value": {
        "compositeSelect": 0,
        "lineCapSelect": 0
      },
      "slider": {
        "opacity": 100,
        "size": 10,
      },
      "checked": {
        "smoothenStrokes": true
      }
    },
    
    "fill": {
      "value": {
        "compositeSelect": 0,
        "fillBySelect": 0
      },
      "slider": {
        "opacity": 100,
        "fillThreshold": 15
      }
    },
    
    "colourPicker": {
      "checked": {
        "colourPickerMerge": false,
        "colourPickerOpacity": false
      }
    },
    
    "select": null,
    
    "line": {
      "value": {
        "compositeSelect": 0,
        "lineCapSelect": 0
      },
      "slider": {
        "opacity": 100,
        "size": 10,
      }
    },
    
    "rect": {
      "value": {
        "compositeSelect": 0
      },
      "slider": {
        "opacity": 100,
        "size": 10,
      },
      "checked": {
        "shapeOutline": true,
        "shapeFill": false
      }
    },
    
    "ellipse": {
      "value": {
        "compositeSelect": 0
      },
      "slider": {
        "opacity": 100,
        "size": 10,
      },
      "checked": {
        "shapeOutline": true,
        "shapeFill": false
      }
    }
  },
  
  // Save current tool's settings
  saveToolSettings(tool) {
    if (!this.settings[tool]) {
      return;
    }
    
    for (const [type, inputs] of Object.entries(this.settings[tool])) {
      for (const input of Object.keys(inputs)) {
        const element = document.getElementById(input);
        switch (type) {
          case "value": {
            inputs[input] = element.value;
            break;
          }
          case "slider": {
            inputs[input] = document.getElementById(input + "Input").dataset.value;
            break;
          }
          case "checked": {
            inputs[input] = element.checked;
            break;
          }
        }
      }
    }
  },
  // Set new tool's settings
  loadToolSettings(tool) {
    if (!this.settings[tool]) {
      return;
    }
    
    for (const [type, inputs] of Object.entries(this.settings[tool])) {
      for (const input of Object.keys(inputs)) {
        const element = document.getElementById(input);
        switch (type) {
          case "value": {
            element.value = inputs[input];
            break;
          }
          case "slider": {
            Slider.setValue(input, parseFloat(inputs[input], 10));
            break;
          }
          case "checked": {
            element.checked = inputs[input];
            break;
          }
        }
      }
    }
  }
};

// Handle mousedown on canvas
function mouseHold(event) {
  if (event.target.tagName !== "CANVAS") {
    return;
  }
  
  // Scrollbars
  const mouse = Canvas.getCursorPos(event);
  if (mouse.y > Canvas.scrollbarX.trough.y) {
    event.preventDefault();
    if (Canvas.scrollbarX.thumb.x < mouse.x && mouse.x < Canvas.scrollbarX.thumb.x + Canvas.scrollbarX.thumb.width) {
      Canvas.scrollbarX.drag = {
        mouse: {...mouse},
        thumb: {
          x: Canvas.scrollbarX.thumb.x,
          y: Canvas.scrollbarX.thumb.y
        },
        pan: {...Canvas.pan}
      };
    }
    return;
  } else if (mouse.x > Canvas.scrollbarY.trough.x) {
    event.preventDefault();
    if (Canvas.scrollbarY.thumb.y < mouse.y && mouse.y < Canvas.scrollbarY.thumb.y + Canvas.scrollbarY.thumb.height) {
      Canvas.scrollbarY.drag = {
        mouse: {...mouse},
        thumb: {
          x: Canvas.scrollbarY.thumb.x,
          y: Canvas.scrollbarY.thumb.y
        },
        pan: {...Canvas.pan}
      };
    }
    return;
  }
  
  const point = Canvas.getPixelPos(event);
  
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
  event.preventDefault();
  const currentAction = clients[Client.id].action;
  if (currentAction.data && currentAction.data.selected) {
    const handle = SelectTool.getResizeHandle(mouse, [0, 1, 2, 3, 4, 5, 6, 7]);
    if (handle !== null) {
      const roundedPoint = Canvas.getPixelPos(event, { round: true });
      currentAction.data.resize = {
        handle: handle,
        x: roundedPoint.x,
        y: roundedPoint.y
      };
      currentAction.data.old = {
        x: currentAction.data.x,
        y: currentAction.data.y,
        width: currentAction.data.width,
        height: currentAction.data.height
      };
      currentAction.type = Action.SELECTION_RESIZE;
      Session.startClientAction(Client.id, currentAction);
      return;
    } else if (isPointInside(point.x, point.y, currentAction.data)) {
      currentAction.data.move = {
        x: point.x,
        y: point.y
      };
      currentAction.type = Action.SELECTION_MOVE;
      Session.startClientAction(Client.id, currentAction);
      return;
    }
  }
  if (
    tool !== "select" && (
      point.x < 0 || point.x > Session.canvas.width
      || point.y < 0 || point.y > Session.canvas.height
    )
  ) {
    return;
  }
  startTool(point);
}
function startTool(point) {
  clients[Client.id].action.type = null;
  
  const size = parseInt(document.getElementById("sizeInput").dataset.value, 10);
  const opacity = parseFloat(document.getElementById("opacityInput").dataset.value) / 100;
  const compOp = parseInt(document.getElementById("compositeSelect").value, 10);
  const shapeOutline = document.getElementById("shapeOutline").checked;
  const shapeFill = document.getElementById("shapeFill").checked;
  const caps = parseInt(document.getElementById("lineCapSelect").value);
  
  if (tool !== "select") {
    SelectTool.remove();
  }
  
  switch (tool) {
    case "pen": {
      Session.startClientAction(Client.id, new Action({
        type: Action.STROKE,
        data: new Stroke({
          points: [],
          colour: penColours[currentPen],
          size: size,
          caps: caps,
          opacity: opacity,
          compOp: compOp,
          smoothen: document.getElementById("smoothenStrokes").checked
        })
      }));
      Client.sendMessage({
        type: Message.START_STROKE,
        clientId: Client.id,
        action: clients[Client.id].action
      });
      PenTool.draw(point.x, point.y);
      break;
    }
    case "fill": {
      const fill = new Fill({
        x: point.x,
        y: point.y,
        colour: penColours[currentPen],
        threshold: parseInt(document.getElementById("fillThresholdInput").dataset.value, 10),
        opacity: opacity,
        compOp: compOp,
        fillBy: parseInt(document.getElementById("fillBySelect").value, 10)
      });
      Client.sendMessage({
        type: Message.FILL,
        fill: fill
      });
      FillTool.fill(fill);
      break;
    }
    case "colourPicker": {
      const pixelColour = Session.ctx.getImageData(point.x, point.y, 1, 1).data;
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
      Colour.change(currentPen, Colour.rgbToHex(colour));
      if (document.getElementById("colourPickerOpacity").checked) {
        var newOpacity = (pixelColour[3] / 255) * 100;
        if (merge) {
          newOpacity = (newOpacity + (opacity * 100)) / 2;
        }
        Slider.setValue("opacity", newOpacity);
      }
      break;
    }
    case "select": {
      const selection = new Selection({
        selected: false,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        move: new Pos2D({
          x: null,
          y: null
        }),
        resize: new SelectionResize({
          handle: null,
          x: null,
          y: null
        }),
        flipped: new Pos2D({
          x: false,
          y: false
        }),
        data: null,
        old: null
      });
      Client.sendMessage({
        type: Message.SELECTION_CREATE,
        clientId: Client.id,
        selection: selection
      });
      Session.startClientAction(Client.id, new Action({
        type: Action.SELECTING,
        data: selection
      }));
      break;
    }
    case "line": {
      Session.startClientAction(Client.id, new Action({
        type: Action.LINE,
        data: new Line({
          x0: point.x,
          y0: point.y,
          x1: point.x,
          y1: point.y,
          colour: penColours[currentPen],
          width: size,
          caps: caps,
          opacity: opacity,
          compOp: compOp
        })
      }));
      break;
    }
    case "rect": {
      if (!shapeOutline && !shapeFill) {
        break;
      }
      Session.startClientAction(Client.id, new Action({
        type: Action.RECT,
        data: new Shape({
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          colours: new ShapeColours({
            outline: penColours[currentPen],
            fill: penColours[(currentPen + 1) % 2]
          }),
          lineWidth: size,
          opacity: opacity,
          compOp: compOp,
          outline: shapeOutline,
          fill: shapeFill
        })
      }));
      break;
    }
    case "ellipse": {
      if (!shapeOutline && !shapeFill) {
        break;
      }
      Session.startClientAction(Client.id, new Action({
        type: Action.ELLIPSE,
        data: new Shape({
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          colours: new ShapeColours({
            outline: penColours[currentPen],
            fill: penColours[(currentPen + 1) % 2]
          }),
          lineWidth: size,
          opacity: opacity,
          compOp: compOp,
          outline: shapeOutline,
          fill: shapeFill
        })
      }));
      break;
    }
  }
}
// Handle mousemove (prepare update and add point to stroke if drawing)
function mouseMove(event) {
  // If not on the drawing "page", ignore
  if (!document.getElementById("drawScreen").contains(event.target)) {
    return;
  }
  
  const point = Canvas.getPixelPos(event);
  const posInfo = document.getElementById("cursorPos");
  posInfo.textContent = `${point.x}, ${point.y}`;
  if (point.x >= 0 && point.x < Session.canvas.width && point.y >= 0 && point.y < Session.canvas.height) {
    posInfo.classList.remove("disabled")
  } else {
    posInfo.classList.add("disabled");
  }
  
  const mouse = Canvas.getCursorPos(event);
  if (Canvas.scrollbarX.drag) {
    event.preventDefault();
    Canvas.pan.x = ((Canvas.scrollbarX.drag.thumb.x + (mouse.x - Canvas.scrollbarX.drag.mouse.x)) / (Canvas.scrollbarX.trough.width - 2)) * (Session.canvas.width * Canvas.zoom);
    Canvas.drawCanvas();
    return;
  } else if (Canvas.scrollbarY.drag) {
    event.preventDefault();
    Canvas.pan.y = ((Canvas.scrollbarY.drag.thumb.y + (mouse.y - Canvas.scrollbarY.drag.mouse.y)) / (Canvas.scrollbarY.trough.height - 2)) * (Session.canvas.height * Canvas.zoom);
    Canvas.drawCanvas();
    return;
  }
  
  const currentAction = clients[Client.id].action;
  const roundedPoint = Canvas.getPixelPos(event, { round: true });
  switch (currentAction.type) {
    case Action.STROKE: {
      event.preventDefault();
      PenTool.draw(point.x, point.y);
      break;
    }
    case Action.LINE: {
      event.preventDefault();
      currentAction.data.x1 = point.x, currentAction.data.y1 = point.y;
      Client.sendMessage({
        type: Message.LINE,
        clientId: Client.id,
        line: currentAction.data
      });
      clients[Client.id].action = currentAction;
      LineTool.draw(currentAction.data, Client.ctx);
      break;
    }
    case Action.RECT: {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      Client.sendMessage({
        type: Message.RECT,
        clientId: Client.id,
        rect: currentAction.data
      });
      clients[Client.id].action = currentAction;
      RectTool.draw(currentAction.data, Client.ctx);
      break;
    }
    case Action.ELLIPSE: {
      event.preventDefault();
      currentAction.data.width = point.x - currentAction.data.x;
      currentAction.data.height = point.y - currentAction.data.y;
      Client.sendMessage({
        type: Message.ELLIPSE,
        clientId: Client.id,
        ellipse: currentAction.data
      });
      clients[Client.id].action = currentAction;
      EllipseTool.draw(currentAction.data, Client.ctx);
      break;
    }
    case Action.SELECTING: {
      event.preventDefault();
      currentAction.data.width = roundedPoint.x - currentAction.data.x;
      currentAction.data.height = roundedPoint.y - currentAction.data.y;
      clients[Client.id].action = currentAction;
      SelectTool.update(false);
      break;
    }
    case Action.SELECTION_MOVE: {
      event.preventDefault();
      currentAction.data.x += roundedPoint.x - currentAction.data.move.x;
      currentAction.data.y += roundedPoint.y - currentAction.data.move.y;
      currentAction.data.move.x = roundedPoint.x;
      currentAction.data.move.y = roundedPoint.y;
      clients[Client.id].action = currentAction;
      SelectTool.update(true);
      break;
    }
    case Action.SELECTION_RESIZE: {
      event.preventDefault();
      // 0-1-2
      // 3   4
      // 5-6-7
      var changeX = 0, changeY = 0, changeW = 0, changeH = 0;
      switch (currentAction.data.resize.handle) {
        case 0: {
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
      const dx = roundedPoint.x - currentAction.data.resize.x;
      const dy = roundedPoint.y - currentAction.data.resize.y;
      currentAction.data.width += dx * changeW;
      currentAction.data.x -= dx * changeX;
      currentAction.data.height += dy * changeH;
      currentAction.data.y -= dy * changeY;
      currentAction.data.resize.x = roundedPoint.x;
      currentAction.data.resize.y = roundedPoint.y;
      clients[Client.id].action = currentAction;
      SelectTool.adjustSizeAbsolute();
      SelectTool.update(true);
      break;
    }
  }
  var cursor = "auto";
  if (currentAction.data && currentAction.data.selected) {
    if (currentAction.type === Action.SELECTION_RESIZE) {
      // Always use resizing cursors
      cursor = SelectTool.RESIZE_CURSORS[currentAction.data.resize.handle];
    } else if (currentAction.type === Action.SELECTION_MOVE) {
      // Always use move cursor
      cursor = "move";
    } else {
      const resizeCursor = SelectTool.getResizeHandle(mouse, SelectTool.RESIZE_CURSORS);
      const exactPoint = Canvas.getPixelPos(event, { floor: false });
      if (resizeCursor !== null) {
        cursor = resizeCursor;
      } else if (isPointInside(exactPoint.x, exactPoint.y, currentAction.data)) {
        cursor = "move";
      }
    }
  }
  Canvas.displayCanvas.style.cursor = cursor;
  
  mouseMoved.moved = true;
  if (event.target.tagName !== "CANVAS") {
    mouseMoved.x = -1;
  } else {
    mouseMoved.x = point.x;
    mouseMoved.y = point.y;
  }
}
// Handle mouseup
function clearMouseHold(event) {
  if (!clients.hasOwnProperty(Client.id)) {
    return;
  }
  
  Canvas.scrollbarX.drag = null;
  Canvas.scrollbarY.drag = null;
  
  const currentAction = clients[Client.id].action;
  var keepAction = false;
  switch (currentAction.type) {
    case Action.STROKE: {
      event.preventDefault();
      const point = Canvas.getPixelPos(event);
      PenTool.draw(point.x, point.y);
      Client.sendMessage({
        type: Message.END_STROKE,
        clientId: Client.id
      });
      PenTool.commitStroke(Client.canvas, currentAction.data);
      break;
    }
    case Action.LINE: {
      event.preventDefault();
      Client.sendMessage({
        type: Message.COMMIT_LINE,
        line: currentAction.data,
        clientId: Client.id
      });
      Canvas.update({ save: true });
      Client.ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
      ActionHistory.addToUndo(PastAction.LINE, currentAction.data);
      break;
    }
    case Action.RECT: {
      event.preventDefault();
      Client.sendMessage({
        type: Message.COMMIT_RECT,
        rect: currentAction.data,
        clientId: Client.id
      });
      Canvas.update({ save: true });
      Client.ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
      ActionHistory.addToUndo(PastAction.RECT, currentAction.data);
      break;
    }
    case Action.ELLIPSE: {
      event.preventDefault();
      Client.sendMessage({
        type: Message.COMMIT_ELLIPSE,
        ellipse: currentAction.data,
        clientId: Client.id
      });
      Canvas.update({ save: true });
      Client.ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
      ActionHistory.addToUndo(PastAction.ELLIPSE, currentAction.data);
      break;
    }
    case Action.SELECTING: {
      event.preventDefault();
      if (currentAction.data.width && currentAction.data.height) {
        currentAction.data.selected = true;
        clients[Client.id].action = currentAction;
        SelectTool.adjustSizeAbsolute();
        SelectTool.draw(Client.ctx, clients[Client.id].action.data, true);
        keepAction = true;
      } else {
        SelectTool.remove();
      }
      break;
    }
    case Action.SELECTION_MOVE:
    case Action.SELECTION_RESIZE: {
      event.preventDefault();
      if (!(currentAction.data.width && currentAction.data.height)) {
        currentAction.data.x = currentAction.data.old.x;
        currentAction.data.y = currentAction.data.old.y;
        currentAction.data.width = currentAction.data.old.width;
        currentAction.data.height = currentAction.data.old.height;
        clients[Client.id].action = currentAction;
      }
      delete clients[Client.id].action.data.old;
      SelectTool.draw(Client.ctx, clients[Client.id].action.data, true);
      keepAction = true;
      break;
    }
    default: {
      keepAction = true;
      break;
    }
  }
  clients[Client.id].action.type = null;
  if (!keepAction) {
    Session.endClientAction(Client.id);
  }
}

// Switch the current tool
function switchTool(newTool) {
  Tools.saveToolSettings(tool);
  Tools.loadToolSettings(newTool);
  
  tool = newTool;
  
  for (const toolName of Tools.NAMES) {
    document.getElementById(toolName + "Btn").classList.remove("btnSelected");
    const settings = document.getElementsByClassName(toolName + "Settings");
    if (settings) {
      for (var s = 0; s < settings.length; s++) {
        settings[s].classList.remove("currentToolSettings");
      }
    }
  }
  document.getElementById(tool + "Btn").classList.add("btnSelected");
  const settings = document.getElementsByClassName(tool + "Settings");
  if (settings) {
    for (var s = 0; s < settings.length; s++) {
      settings[s].classList.add("currentToolSettings");
    }
  }
  SelectTool.remove();
}
