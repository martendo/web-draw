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

class Fill {
  constructor({ x, y, colour, threshold, opacity, compOp, fillBy }) {
    this.x = x;
    this.y = y;
    this.colour = colour;
    this.threshold = threshold;
    this.opacity = opacity;
    this.compOp = compOp;
    this.fillBy = fillBy;
  }
  
  static packer(fill) {
    return msgpack.encode([
      fill.x,
      fill.y,
      fill.colour,
      fill.threshold,
      fill.opacity,
      fill.compOp,
      fill.fillBy
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new Fill({
      x: properties[0],
      y: properties[1],
      colour: properties[2],
      threshold: properties[3],
      opacity: properties[4],
      compOp: properties[5],
      fillBy: properties[6]
    });
  }
}

const FillTool = {
  // Determine whether a colour is within the flood fill threshold
  checkPixel(pixels, offset, colour, threshold, fillBy) {
    switch (fillBy) {
      // RGBA
      case 0: {
        for (var i = 0; i < 4; i++) {
          if (Math.abs(pixels[offset + i] - colour[i]) > threshold) {
            return false;
          }
        }
        break;
      }
      // RGB
      case 1: {
        for (var i = 0; i < 3; i++) {
          if (Math.abs(pixels[offset + i] - colour[i]) > threshold) {
            return false;
          }
        }
        break;
      }
      // Red
      case 2: {
        if (Math.abs(pixels[offset] - colour[0]) > threshold) {
          return false;
        }
        break;
      }
      // Green
      case 3: {
        if (Math.abs(pixels[offset + 1] - colour[1]) > threshold) {
          return false;
        }
        break;
      }
      // Blue
      case 4: {
        if (Math.abs(pixels[offset + 2] - colour[2]) > threshold) {
          return false;
        }
        break;
      }
      // Alpha
      case 5: {
        if (Math.abs(pixels[offset + 3] - colour[3]) > threshold) {
          return false;
        }
        break;
      }
    }
    return true;
  },
  // Fill an area of the same colour
  fill(fill, user = true) {
    const fillColour = Colour.hexToRgb(fill.colour, 255 * fill.opacity);
    const canvasWidth = Session.canvas.width;
    const canvasHeight = Session.canvas.height;
    const pixels = Session.ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
    var pixelStack = [[fill.x, fill.y]];
    var pixelPos = ((fill.y * canvasWidth) + fill.x) * 4;
    const fillCtx = document.createElement("canvas").getContext("2d");
    fillCtx.canvas.width = canvasWidth;
    fillCtx.canvas.height = canvasHeight;
    var fillPixels = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
    const originalColour = [
      pixels[pixelPos],
      pixels[pixelPos + 1],
      pixels[pixelPos + 2],
      pixels[pixelPos + 3]
    ];
    const seen = new Array(pixels.length).fill(false);
    while(pixelStack.length > 0) {
      const newPos = pixelStack.pop();
      const x = newPos[0], y = newPos[1];
      pixelPos = ((y * canvasWidth) + x) * 4;
      while(y-- >= 0 && this.checkPixel(pixels, pixelPos, originalColour, fill.threshold, fill.fillBy)) {
        pixelPos -= canvasWidth * 4;
      }
      pixelPos += canvasWidth * 4;
      y++;
      var reachLeft = false, reachRight = false;
      while(y++ < canvasHeight - 1 && this.checkPixel(pixels, pixelPos, originalColour, fill.threshold, fill.fillBy)) {
        for (var i = 0; i < 4; i++) {
          fillPixels[pixelPos + i] = fillColour[i];
        }
        seen[pixelPos] = true;
        if (x > 0 && !seen[pixelPos - 4]) {
          if (this.checkPixel(pixels, pixelPos - 4, originalColour, fill.threshold, fill.fillBy)) {
            if (!reachLeft) {
              pixelStack.push([x - 1, y]);
              reachLeft = true;
            }
          } else if (reachLeft) {
            reachLeft = false;
          }
        }
        if (x < canvasWidth - 1 && !seen[pixelPos + 4]) {
          if (this.checkPixel(pixels, pixelPos + 4, originalColour, fill.threshold, fill.fillBy)) {
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
    fillCtx.putImageData(new ImageData(fillPixels, canvasWidth, canvasHeight), 0, 0);
    Canvas.update({
      extras: [{
        canvas: fillCtx.canvas,
        compOp: fill.compOp
      }],
      save: true
    });
    if (user) {
      ActionHistory.addToUndo(PastAction.FILL, fill);
    }
  }
};
