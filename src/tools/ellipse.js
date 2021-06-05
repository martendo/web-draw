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

const EllipseTool = {
  draw(ellipse, ctx, options) {
    if (!ellipse.outline && !ellipse.fill) {
      return;
    }
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    const x = (ellipse.x + (ellipse.x + ellipse.width)) / 2;
    const y = (ellipse.y + (ellipse.y + ellipse.height)) / 2;
    const radiusX = Math.abs(x - ellipse.x);
    const radiusY = Math.abs(y - ellipse.y);
    
    ctx.globalAlpha = ellipse.opacity;
    
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);
    if (ellipse.fill) {
      ctx.fillStyle = ellipse.colours.fill;
      ctx.fill();
    }
    if (ellipse.outline) {
      ctx.strokeStyle = ellipse.colours.outline;
      ctx.lineWidth = ellipse.lineWidth;
      // If line caps are square, there's a weird protrusion on the right side; make sure that doesn't happen
      ctx.lineCap = "butt";
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    
    Canvas.update(options);
  },
};
