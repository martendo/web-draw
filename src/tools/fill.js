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
