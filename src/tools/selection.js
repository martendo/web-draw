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
