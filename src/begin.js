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

// The URL of the WebSockets server
const WSS_URL = "wss://web-draw.herokuapp.com";

// Send mouse movement update to server (if mouse has moved since last update) every X ms.
const MOUSEMOVE_UPDATE_INTERVAL = 50;

// WebSocket closure code descriptions
const CLOSE_CODES = Object.freeze({
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
});

// Values of tool setting <select>s
// Pen stroke and line cap options
const CAPS = Object.freeze([
  "round",
  "butt",
  "square"
]);
// Canvas globalCompositeOperation options
const COMP_OPS = Object.freeze([
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
]);
const DEFAULT_COMP_OP = COMP_OPS[0];

const NO_ACTION = Object.freeze({
  type: null,
  data: null
});

class Pos2D {
  constructor({ x, y }) {
    this.x = x;
    this.y = y;
  }
  
  static packer(pos) {
    return msgpack.encode([
      pos.x,
      pos.y
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new Pos2D({
      x: properties[0],
      y: properties[1]
    });
  }
}

class Shape {
  constructor({ x, y, width, height, colours, lineWidth, opacity, compOp, outline, fill }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.colours = colours;
    this.lineWidth = lineWidth;
    this.opacity = opacity;
    this.compOp = compOp;
    this.outline = outline;
    this.fill = fill;
  }
  
  static packer(shape) {
    return msgpack.encode([
      shape.x,
      shape.y,
      shape.width,
      shape.height,
      shape.colours,
      shape.lineWidth,
      shape.opacity,
      shape.compOp,
      shape.outline,
      shape.fill
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new Shape({
      x: properties[0],
      y: properties[1],
      width: properties[2],
      height: properties[3],
      colours: properties[4],
      lineWidth: properties[5],
      opacity: properties[6],
      compOp: properties[7],
      outline: properties[8],
      fill: properties[9],
    });
  }
}
class ShapeColours {
  constructor({ outline, fill }) {
    this.outline = outline;
    this.fill = fill;
  }
  
  static packer(colours) {
    return msgpack.encode([
      colours.outline,
      colours.fill
    ]);
  }
  static unpacker(buffer) {
    const properties = msgpack.decode(buffer);
    return new ShapeColours({
      outline: properties[0],
      fill: properties[1]
    });
  }
}

// Check if a point is within an area
function isPointInside(x, y, rect) {
  return (
    rect.x <= x && x < rect.x + rect.width
    && rect.y <= y && y < rect.y + rect.height
  );
}

// Use an upper and lower bound on a number
function minmax(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

const Images = Object.freeze({
  CURSOR: "{{ BASE64:src/img/cursor.png }}",
  VISIBLE: "{{ BASE64:src/img/visible.png }}",
  NO_VISIBLE: "{{ BASE64:src/img/no-visible.png }}",
  UP: "{{ BASE64:src/img/up.png }}",
  DOWN: "{{ BASE64:src/img/down.png }}",
  TRANSPARENT: "{{ BASE64:src/img/transparent.png }}"
});
