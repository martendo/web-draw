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

export class Shape {
	x: number;
	y: number;
	width: number;
	height: number;
	colours: ShapeColours;
	lineWidth: number;
	opacity: number;
	compOp: Canvas.CompositeOp;
	outline: boolean;
	fill: boolean;

	constructor({x, y, width, height, colours, lineWidth, opacity, compOp, outline, fill}: Shape) {
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

	static packer(shape: Shape): Uint8Array {
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
			shape.fill,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): Shape {
		const properties: [number, number, number, number, ShapeColours, number, number, Canvas.CompositeOp, boolean, boolean] = msgpack.decode([0x9A, ...new Uint8Array(buffer)]);
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

export class ShapeColours {
	outline: string;
	fill: string;

	constructor({outline, fill}: ShapeColours) {
		this.outline = outline;
		this.fill = fill;
	}

	static packer(colours: ShapeColours): Uint8Array {
		return msgpack.encode([
			colours.outline,
			colours.fill,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): ShapeColours {
		const properties: [string, string] = msgpack.decode([0x92, ...new Uint8Array(buffer)]);
		return new ShapeColours({
			outline: properties[0],
			fill: properties[1],
		});
	}
}
