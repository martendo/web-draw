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

const Colour = {
  // Starting pen colours
  DEFAULTS: ["#000000", "#ffffff"],
  // Blank canvas colour
  BLANK: "#ffffff",

  // Basic colours for quick selection
  // Stolen from MS Paint
  BASICS: {
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
  },
  
  // Convert hex colour value to an RGBA array
  hexToRgb(colour, alpha = 255) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colour);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
      alpha
    ] : null;
  },
  rgbToHex(colour) {
    return "#" + ("00000" + ((colour[0] << 16) + (colour[1] << 8) + colour[2]).toString(16)).substr(-6);
  },
  
  // Open the colour picker
  openPicker(num) {
    const colourPicker = document.getElementById("colourPicker");
    const colourRect = document.getElementById("penColour" + num).getBoundingClientRect();
    colourPicker.style.left = colourRect.x + "px";
    colourPicker.style.top = (colourRect.y + colourRect.height) + "px";
    colourPicker.value = penColours[num];
    setTimeout(() => colourPicker.click(), 10);
  },
  
  // Set one of the colours
  change(num, value, addCustom = true) {
    this.update(num, value);
    penColours[num] = value;
    if (addCustom) {
      // Check if colour is one of the basic colours, if it is, don't add it to the custom colours
      for (var i = 0; i < Colour.BASICS.values.length; i++) {
        if (Colour.BASICS.values[i].includes(value)) return;
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
        colourBox.onclick = (event) => Colour.setClicked(event, col);
        colourBox.oncontextmenu = (event) => Colour.setClicked(event, col);
      }
    }
  },
  // Update colour value if value is a hex colour
  changeWithValue(num, event) {
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
      if (value.slice(0, 1) !== "#") value = "#" + value;
      if (value.length > 6+1) {
        alpha = parseInt(value.slice(-2), 16);
        value = value.slice(0, -2);
      }
      if (typeof alpha !== "undefined") {
        const opacityInput = document.getElementById("opacityInput");
        const newOpacity = (alpha / 255) * 100;
        Slider.setValue("opacity", newOpacity);
      }
      this.change(num, value);
    } else {
      this.update(num, event.currentTarget.dataset.lastValue);
    }
  },
  // Update colour value and box, but don't set the colour
  update(num, value) {
    const valueWithAlpha = value + ("0" + Math.round(parseFloat(document.getElementById("opacityInput").dataset.value, 10) / 100 * 255).toString(16)).slice(-2);
    document.getElementById("penColour" + num).style.backgroundColor = valueWithAlpha;
    const colourValue = document.getElementById(`penColour${num}Value`);
    colourValue.value = valueWithAlpha;
    colourValue.dataset.lastValue = value;
  },
  
  // Set the colour for the mouse button that was clicked
  setClicked(event, col) {
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
    this.change(num, col, false);
  }
};
