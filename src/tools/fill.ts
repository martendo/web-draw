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
import * as ActionHistory from "../action-history";
import {PastActionType} from "../action-history";
import * as Canvas from "../canvas";
import * as Colour from "../colour";
import {ColourArray} from "../colour";
import * as Session from "../session";

export enum FillBy {
	RGBA,
	RGB,
	RED,
	BLUE,
	GREEN,
	ALPHA,
}
export const DEFAULT_FILL_BY: FillBy = FillBy.RGBA;

export class Fill {
	x: number;
	y: number;
	colour: string;
	threshold: number;
	opacity: number;
	compOp: Canvas.CompositeOp;
	fillBy: FillBy;

	constructor({x, y, colour, threshold, opacity, compOp, fillBy}: Fill) {
		this.x = x;
		this.y = y;
		this.colour = colour;
		this.threshold = threshold;
		this.opacity = opacity;
		this.compOp = compOp;
		this.fillBy = fillBy;
	}

	static packer(fill: Fill): Uint8Array {
		return msgpack.encode([
			fill.x,
			fill.y,
			fill.colour,
			fill.threshold,
			fill.opacity,
			fill.compOp,
			fill.fillBy,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): Fill {
		const properties: [number, number, string, number, number, Canvas.CompositeOp, FillBy] = msgpack.decode([0x97, ...new Uint8Array(buffer)]);
		return new Fill({
			x: properties[0],
			y: properties[1],
			colour: properties[2],
			threshold: properties[3],
			opacity: properties[4],
			compOp: properties[5],
			fillBy: properties[6],
		});
	}
}

// Determine whether a colour is within the flood fill threshold
function checkPixel(pixels: Uint8ClampedArray, offset: number, colour: ColourArray, threshold: number, fillBy: FillBy): boolean {
	switch (fillBy) {
		case FillBy.RGBA:
			for (let i: number = 0; i < 4; i++) {
				if (Math.abs(pixels[offset + i] - colour[i]) > threshold)
					return false;
			}
			break;
		case FillBy.RGB:
			for (let i: number = 0; i < 3; i++) {
				if (Math.abs(pixels[offset + i] - colour[i]) > threshold)
					return false;
			}
			break;
		case FillBy.RED:
			if (Math.abs(pixels[offset] - colour[0]) > threshold)
				return false;
			break;
		case FillBy.GREEN:
			if (Math.abs(pixels[offset + 1] - colour[1]) > threshold)
				return false;
			break;
		case FillBy.BLUE:
			if (Math.abs(pixels[offset + 2] - colour[2]) > threshold)
				return false;
			break;
		case FillBy.ALPHA:
			if (Math.abs(pixels[offset + 3] - colour[3]) > threshold)
				return false;
			break;
	}
	return true;
}

// Fill an area of the same colour
export function fill(fill: Fill, user: boolean = true): void {
	const fillColour: ColourArray = Colour.hexToRgb(fill.colour, 255 * fill.opacity);
	const canvasWidth: number = Session.canvas.width;
	const canvasHeight: number = Session.canvas.height;
	const pixels: Uint8ClampedArray = Session.ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
	let pixelStack: [number, number][] = [[fill.x, fill.y]];
	let pixelPos: number = ((fill.y * canvasWidth) + fill.x) * 4;
	const fillCtx: CanvasRenderingContext2D = document.createElement("canvas").getContext("2d");
	fillCtx.canvas.width = canvasWidth;
	fillCtx.canvas.height = canvasHeight;
	let fillPixels: Uint8ClampedArray = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
	const originalColour: ColourArray = [
		pixels[pixelPos],
		pixels[pixelPos + 1],
		pixels[pixelPos + 2],
		pixels[pixelPos + 3],
	];
	const seen: boolean[] = new Array(pixels.length).fill(false);
	while(pixelStack.length > 0) {
		const newPos: [number, number] = pixelStack.pop();
		let x: number = newPos[0];
		let y: number = newPos[1];
		pixelPos = ((y * canvasWidth) + x) * 4;
		while(y-- >= 0 && checkPixel(pixels, pixelPos, originalColour, fill.threshold, fill.fillBy))
			pixelPos -= canvasWidth * 4;
		pixelPos += canvasWidth * 4;
		y++;
		let reachLeft: boolean = false;
		let reachRight: boolean = false;
		while(y++ < canvasHeight - 1 && checkPixel(pixels, pixelPos, originalColour, fill.threshold, fill.fillBy)) {
			for (let i: number = 0; i < 4; i++)
				fillPixels[pixelPos + i] = fillColour[i];
			seen[pixelPos] = true;
			if (x > 0 && !seen[pixelPos - 4]) {
				if (checkPixel(pixels, pixelPos - 4, originalColour, fill.threshold, fill.fillBy)) {
					if (!reachLeft) {
						pixelStack.push([x - 1, y]);
						reachLeft = true;
					}
				} else if (reachLeft) {
					reachLeft = false;
				}
			}
			if (x < canvasWidth - 1 && !seen[pixelPos + 4]) {
				if (checkPixel(pixels, pixelPos + 4, originalColour, fill.threshold, fill.fillBy)) {
					if (!reachRight) {
						pixelStack.push([x + 1, y]);
						reachRight = true;
					}
				} else if (reachRight) {
					reachRight = false;
				}
			}
			pixelPos += canvasWidth * 4;
		}
	}
	fillCtx.putImageData(new ImageData(fillPixels, canvasWidth, canvasHeight), 0, 0);
	Canvas.update({
		extras: [{
			canvas: fillCtx.canvas,
			compOp: fill.compOp,
		}],
		save: true,
	});
	if (user)
		ActionHistory.append(PastActionType.FILL, fill);
}
