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

const RectTool = {
  draw(rect, ctx, options) {
    if (!rect.outline && !rect.fill) {
      return;
    }
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    const x = rect.lineWidth % 2 !== 0 ? rect.x + 0.5 : rect.x;
    const y = rect.lineWidth % 2 !== 0 ? rect.y + 0.5 : rect.y;
    
    ctx.lineJoin = "miter";
    ctx.globalAlpha = rect.opacity;
    
    ctx.beginPath();
    ctx.rect(x, y, rect.width, rect.height);
    if (rect.fill) {
      ctx.fillStyle = rect.colours.fill;
      ctx.fill();
    }
    if (rect.outline) {
      ctx.strokeStyle = rect.colours.outline;
      ctx.lineWidth = rect.lineWidth;
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    
    Canvas.update(options);
  }
};
