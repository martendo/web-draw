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

const Slider = {
  current: null,
  
  // Callback functions
  CALLBACKS: {
    "updateColourAlpha": function updateColourAlpha(value) {
      for (var i = 0; i < 2; i++) {
        const colourValue = document.getElementById(`penColour${i}Value`);
        colourValue.value = colourValue.value.slice(0, -2) + ("0" + Math.round(value / 100 * 255).toString(16)).slice(-2);
        document.getElementById("penColour" + i).style.backgroundColor = colourValue.value;
      }
    }
  },
  
  // All the slider inputs to set up
  DEFAULT_VALUES: {
    "penWidth": 10,
    "opacity": 100,
    "fillThreshold": 15
  },
  
  init() {
    // Set up slider inputs
    const sliders = document.getElementsByClassName("sliderInput");
    for (var i = 0; i < sliders.length; i++) {
      const id = sliders[i].id.slice(0, -("Input".length));
      Slider.setValue(id, this.DEFAULT_VALUES[id], { callback: false });
    }
  },
  
  update(event) {
    if (!this.current) return;
    const input = document.getElementById(this.current + "Input");
    const rect = input.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    const fraction = dx / rect.width;
    const min = parseFloat(input.dataset.min);
    const value = Math.min(Math.max((fraction * (parseFloat(input.dataset.width) - min)) + min, min), parseFloat(input.dataset.max));
    this.setValue(this.current, value, { fraction });
  },
  setValue(id, value, { fraction = null, callback = true } = {}) {
    const input = document.getElementById(id + "Input");
    value = value.toFixed(input.dataset.dplaces);
    input.dataset.value = value;
    document.getElementById(id + "Value").textContent = value;
    
    const min = parseFloat(input.dataset.min);
    if (!fraction) fraction = (value - min) / (parseFloat(input.dataset.width) - min);
    document.getElementById(id + "Bar").style.width = Math.max(Math.min(fraction * 100, 100), 0) + "%";
    
    if (input.dataset.callback && callback) this.CALLBACKS[input.dataset.callback](value);
  },
  arrow(id, dir) {
    const slider = document.getElementById(id + "Input");
    const newVal = Math.min(Math.max(parseFloat(slider.dataset.value) + (dir === "up" ? 1 : -1), parseFloat(slider.dataset.min)), parseFloat(slider.dataset.max));
    this.setValue(id, newVal);
  }
};

const sliders = document.getElementsByClassName("sliderInput");
for (var i = 0; i < sliders.length; i++) {
  const slider = sliders[i];
  const id = slider.id.slice(0, -("Input".length));
  document.getElementById(id + "Value").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    // Manually enter a value
    var value = parseFloat(event.target.textContent);
    if (typeof value !== "number" || isNaN(value)) return;
    if (value > slider.dataset.max) {
      value = parseFloat(slider.dataset.max);
    } else if (value < slider.dataset.min) {
      value = parseFloat(slider.dataset.min);
    }
    Slider.setValue(id, value);
  });
  // Use up/down arrows
  const up = document.getElementById(id + "ValueUp");
  const down = document.getElementById(id + "ValueDown");
  // Up arrow
  up.addEventListener("pointerdown", (event) => {
    // Increment value once first
    Slider.arrow(id, "up");
    // After holding for a bit...
    upTimeout = setTimeout(function repeatUp() {
      // ...increment again
      Slider.arrow(id, "up");
      // Faster incrementing after holding for a while
      upTimeout = setTimeout(() => repeatUp(), 30);
    }, 300);
    event.stopPropagation();
  });
  // Down arrow
  down.addEventListener("pointerdown", (event) => {
    Slider.arrow(id, "down");
    downTimeout = setTimeout(function repeatDown() {
      Slider.arrow(id, "down");
      downTimeout = setTimeout(() => repeatDown(), 30);
    }, 300);
    event.stopPropagation();
  });
  // Clicked on slider and not on arrows or anything else; move bar
  slider.addEventListener("pointerdown", (event) => {
    Slider.current = id;
    Slider.update(event);
  });
}

document.addEventListener("pointermove", (event) => Slider.update(event));

var upTimeout, downTimeout;
document.addEventListener("pointerup", () => {
  Slider.current = null;
  clearTimeout(upTimeout);
  clearTimeout(downTimeout);
});
