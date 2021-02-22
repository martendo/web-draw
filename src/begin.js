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

// Add ImageData object to msgpack codec
msgpack.codec.preset.addExtPacker(0x00, ImageData, (imageData) => {
  return msgpack.encode([
    imageData.data,
    imageData.width,
    imageData.height
  ]);
});
msgpack.codec.preset.addExtUnpacker(0x00, (buffer) => {
  const properties = msgpack.decode(buffer);
  return new ImageData(properties[0], properties[1], properties[2]);
});

// Check if a point is within an area
function isPointInside(x, y, rect) {
  return (rect.x < x && x < rect.x + rect.width &&
          rect.y < y && y < rect.y + rect.height);
}

// Use an upper and lower bound on a number
function minmax(num, min, max) {
  return Math.min(Math.max(num, min), max);
}