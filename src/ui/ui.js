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

// Copy text to the clipboard
function copyText(text, event = null) {
  navigator.clipboard.writeText(text, null, () => {
    console.log("navigator.clipboard.writeText failed");
    const textarea = document.createElement("textarea");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  });
  if (event) {
    const tooltip = document.getElementById("tooltip");
    tooltip.textContent = "Copied!";
    tooltip.style.left = (event.clientX + 20) + "px";
    tooltip.style.top = (event.clientY - 30) + "px";
    tooltip.style.visibility = "visible";
    setTimeout(() => {
      tooltip.style.visibility = "hidden";
    }, 1000);
  }
}

function setTheme(theme) {
  document.documentElement.className = theme;
  localStorage.setItem("theme", theme);
}

const Icons = Object.freeze({
  cursor:    "{{ BASE64:src/img/cursor.png }}",
  visible:   "{{ BASE64:src/img/visible.png }}",
  noVisible: "{{ BASE64:src/img/no-visible.png }}",
  up:        "{{ BASE64:src/img/up.png }}",
  down:      "{{ BASE64:src/img/down.png }}"
});
