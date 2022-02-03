/*
 * This file is part of Web Draw.
 *
 * Web Draw - A little real-time online collaborative drawing program.
 * Copyright (C) 2020-2022 martendo
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

import * as msgpack from "msgpack-lite";
import * as Canvas from "../canvas";

export class Line {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	colour: string;
	width: number;
	caps: Canvas.LineCap;
	opacity: number;
	compOp: Canvas.CompositeOp;

	constructor({x0, y0, x1, y1, colour, width, caps, opacity, compOp}: Line) {
		this.x0 = x0;
		this.y0 = y0;
		this.x1 = x1;
		this.y1 = y1;
		this.colour = colour;
		this.width = width;
		this.caps = caps;
		this.opacity = opacity;
		this.compOp = compOp;
	}

	static packer(line: Line): Uint8Array {
		return msgpack.encode([
			line.x0,
			line.y0,
			line.x1,
			line.y1,
			line.colour,
			line.width,
			line.caps,
			line.opacity,
			line.compOp,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): Line {
		const properties: [number, number, number, number, string, number, number, number, Canvas.CompositeOp] = msgpack.decode([0x99, ...new Uint8Array(buffer)]);
		return new Line({
			x0: properties[0],
			y0: properties[1],
			x1: properties[2],
			y1: properties[3],
			colour: properties[4],
			width: properties[5],
			caps: properties[6],
			opacity: properties[7],
			compOp: properties[8],
		});
	}
}

export function draw(line: Line, ctx: CanvasRenderingContext2D, options?): void {
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	ctx.strokeStyle = line.colour;
	ctx.lineCap = Canvas.CAPS[line.caps];
	ctx.lineWidth = line.width;
	ctx.globalAlpha = line.opacity;

	ctx.beginPath();
	ctx.moveTo(line.x0, line.y0);
	ctx.lineTo(line.x1, line.y1);
	ctx.stroke();

	ctx.globalAlpha = 1;

	Canvas.update(options);
}
