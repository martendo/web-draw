/*
 * This file is part of Web Draw.
 *
 * Web Draw - A little real-time online collaborative drawing program.
 * Copyright (C) 2020-2021 martendo
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

const Modal = {
  // Current modal z-index - newest modal should always show up at the top
  index: 100,
  
  open(id) {
    const modal = document.getElementById(id);
    // `grid` centres content without translate but others don't...
    modal.style.display = "grid";
    modal.style.zIndex = this.index++;
  },
  close(id) {
    document.getElementById(id).style.display = "none";
    const modals = document.getElementsByClassName("modal");
    for (var i = 0; i < modals.length; i++) {
      const modal = modals[i];
      if (modal.style.display !== "none" && modal.style.display !== "") {
        return;
      }
    }
    this.index = 100;
  },
};
