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
import {Message} from "../message";
import * as ActionHistory from "../action-history";
import {PastActionType} from "../action-history";
import * as Canvas from "../canvas";
import {ColourRect} from "../canvas";
import * as Client from "../client";
import * as Colour from "../colour";
import * as Session from "../session";
import {Action, ActionType} from "../session";
import {Vector2, isPointInside} from "../helpers";

export class Selection {
	selected: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	move: Vector2<number>;
	resize: SelectionResize;
	flipped: Vector2<boolean>;
	data: ImageData;
	old: OldSelection;

	constructor({selected, x, y, width, height, move, resize, flipped, data, old}: Selection) {
		this.selected = selected;
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
		this.move = move;
		this.resize = resize;
		this.flipped = flipped;
		this.data = data;
		this.old = old;
	}

	static packer(selection: Selection): Uint8Array {
		return msgpack.encode([
			selection.selected,
			selection.x,
			selection.y,
			selection.width,
			selection.height,
			selection.move,
			selection.resize,
			selection.flipped,
			selection.data,
			selection.old,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): Selection {
		const properties: [boolean, number, number, number, number, Vector2<number>, SelectionResize, Vector2<boolean>, ImageData, OldSelection] = msgpack.decode([0x99, ...new Uint8Array(buffer)]);
		return new Selection({
			selected: properties[0],
			x: properties[1],
			y: properties[2],
			width: properties[3],
			height: properties[4],
			move: properties[5],
			resize: properties[6],
			flipped: properties[7],
			data: properties[8],
			old: properties[9],
		});
	}
}

export class ShortSelection {
	x: number;
	y: number;
	width: number;
	height: number;
	flipped: Vector2<boolean>;

	constructor({x, y, width, height, flipped}: ShortSelection) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
		this.flipped = flipped;
	}

	static packer(shortSel: ShortSelection): Uint8Array {
		return msgpack.encode([
			shortSel.x,
			shortSel.y,
			shortSel.width,
			shortSel.height,
			shortSel.flipped,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): ShortSelection {
		const properties: [number, number, number, number, Vector2<boolean>] = msgpack.decode([0x95, ...new Uint8Array(buffer)]);
		return new ShortSelection({
			x: properties[0],
			y: properties[1],
			width: properties[2],
			height: properties[3],
			flipped: properties[4],
		});
	}
}

export class SelectionResize {
	handle: number;
	x: number;
	y: number;

	constructor({handle, x, y}: SelectionResize) {
		this.handle = handle;
		this.x = x;
		this.y = y;
	}

	static packer(selectionResize: SelectionResize): Uint8Array {
		return msgpack.encode([
			selectionResize.handle,
			selectionResize.x,
			selectionResize.y,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): SelectionResize {
		const properties: [number, number, number] = msgpack.decode([0x93, ...new Uint8Array(buffer)]);
		return new SelectionResize({
			handle: properties[0],
			x: properties[1],
			y: properties[2],
		});
	}
}

export class SelectionPaste {
	x: number;
	y: number;
	width: number;
	height: number;
	flipped: Vector2<boolean>;
	data: ImageData;

	constructor({x, y, width, height, flipped, data}: SelectionPaste) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
		this.flipped = flipped;
		this.data = data;
	}

	static packer(shortSel: SelectionPaste): Uint8Array {
		return msgpack.encode([
			shortSel.x,
			shortSel.y,
			shortSel.width,
			shortSel.height,
			shortSel.flipped,
			shortSel.data,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): SelectionPaste {
		const properties: [number, number, number, number, Vector2<boolean>, ImageData] = msgpack.decode([0x96, ...new Uint8Array(buffer)]);
		return new SelectionPaste({
			x: properties[0],
			y: properties[1],
			width: properties[2],
			height: properties[3],
			flipped: properties[4],
			data: properties[5],
		});
	}
}

export class OldSelection {
	x: number;
	y: number;
	width: number;
	height: number;

	constructor({x, y, width, height}: OldSelection) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
	}

	static packer(old: OldSelection): Uint8Array {
		return msgpack.encode([
			old.x,
			old.y,
			old.width,
			old.height,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): OldSelection {
		const properties: [number, number, number, number] = msgpack.decode([0x94, ...new Uint8Array(buffer)]);
		return new OldSelection({
			x: properties[0],
			y: properties[1],
			width: properties[2],
			height: properties[3],
		});
	}
}

// Selection constants & variables
const HANDLE_SIZE: number = 5;
const HANDLE_GRAB_SIZE: number = 15;

// Resize cursor names
export const RESIZE_CURSORS: readonly string[] = [
	"nwse-resize", "ns-resize", "nesw-resize",
	"ew-resize",                "ew-resize",
	"nesw-resize", "ns-resize", "nwse-resize",
];

export function getResizeHandle<Type>(point: Vector2<number>, handles: readonly Type[]): Type | null {
	const selection: Selection = new Selection({...Session.clients[Client.id].action.data});
	selection.x = selection.x * Canvas.zoom - Canvas.pan.x;
	selection.y = selection.y * Canvas.zoom - Canvas.pan.y;
	selection.width *= Canvas.zoom;
	selection.height *= Canvas.zoom;

	if (!selection.selected)
		return null;
	let handle: Type | null = null;
	if (isPointInside(point.x, point.y, {
		x: selection.x - (HANDLE_GRAB_SIZE / 2),
		y: selection.y - (HANDLE_GRAB_SIZE / 2),
		width: HANDLE_GRAB_SIZE,
		height: HANDLE_GRAB_SIZE,
	})) {
		handle = handles[0];
	} else if (isPointInside(point.x, point.y, {
		x: selection.x + (HANDLE_GRAB_SIZE / 2),
		y: selection.y - (HANDLE_GRAB_SIZE / 2),
		width: selection.width - HANDLE_GRAB_SIZE,
		height: HANDLE_GRAB_SIZE,
	})) {
		handle = handles[1];
	} else if (isPointInside(point.x, point.y, {
		x: selection.x + selection.width - (HANDLE_GRAB_SIZE / 2),
		y: selection.y - (HANDLE_GRAB_SIZE / 2),
		width: HANDLE_GRAB_SIZE,
		height: HANDLE_GRAB_SIZE,
	})) {
		handle = handles[2];
	} else if (isPointInside(point.x, point.y, {
		x: selection.x - (HANDLE_GRAB_SIZE / 2),
		y: selection.y + (HANDLE_GRAB_SIZE / 2),
		width: HANDLE_GRAB_SIZE,
		height: selection.height - HANDLE_GRAB_SIZE,
	})) {
		handle = handles[3];
	} else if (isPointInside(point.x, point.y, {
		x: selection.x + selection.width - (HANDLE_GRAB_SIZE / 2),
		y: selection.y + (HANDLE_GRAB_SIZE / 2),
		width: HANDLE_GRAB_SIZE,
		height: selection.height - HANDLE_GRAB_SIZE,
	})) {
		handle = handles[4];
	} else if (isPointInside(point.x, point.y, {
		x: selection.x - (HANDLE_GRAB_SIZE / 2),
		y: selection.y + selection.height - (HANDLE_GRAB_SIZE / 2),
		width: HANDLE_GRAB_SIZE,
		height: HANDLE_GRAB_SIZE,
	})) {
		handle = handles[5];
	} else if (isPointInside(point.x, point.y, {
		x: selection.x + (HANDLE_GRAB_SIZE / 2),
		y: selection.y + selection.height - (HANDLE_GRAB_SIZE / 2),
		width: selection.width - HANDLE_GRAB_SIZE,
		height: HANDLE_GRAB_SIZE,
	})) {
		handle = handles[6];
	} else if (isPointInside(point.x, point.y, {
		x: selection.x + selection.width - (HANDLE_GRAB_SIZE / 2),
		y: selection.y + selection.height - (HANDLE_GRAB_SIZE / 2),
		width: HANDLE_GRAB_SIZE,
		height: HANDLE_GRAB_SIZE,
	})) {
		handle = handles[7];
	}
	return handle;
}

function _drawDashedRect(ctx: CanvasRenderingContext2D, dash: number, rect): void {
	function drawRect() {
		// Left side
		ctx.beginPath();
		ctx.moveTo(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5);
		ctx.lineTo(Math.round(rect.x) + 0.5, Math.round(rect.y + rect.height) + 0.5);
		ctx.stroke();
		// Right side
		ctx.beginPath();
		ctx.moveTo(Math.round(rect.x + rect.width) + 0.5, Math.round(rect.y) + 0.5);
		ctx.lineTo(Math.round(rect.x + rect.width) + 0.5, Math.round(rect.y + rect.height) + 0.5);
		ctx.stroke();
		// Top side
		ctx.beginPath();
		ctx.moveTo(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5);
		ctx.lineTo(Math.round(rect.x + rect.width) + 0.5, Math.round(rect.y) + 0.5);
		ctx.stroke();
		// Bottom side
		ctx.beginPath();
		ctx.moveTo(Math.round(rect.x) + 0.5, Math.round(rect.y + rect.height) + 0.5);
		ctx.lineTo(Math.round(rect.x + rect.width) + 0.5, Math.round(rect.y + rect.height) + 0.5);
		ctx.stroke();
	}

	ctx.strokeStyle = "#000000";
	ctx.lineWidth = 1;
	ctx.setLineDash([dash, dash]);
	ctx.lineDashOffset = 0.5;

	drawRect();

	ctx.strokeStyle = "#ffffff";
	ctx.lineDashOffset = dash + 0.5;

	drawRect();

	ctx.setLineDash([]);
}

export function draw(ctx: CanvasRenderingContext2D, sel: Selection, handles: boolean, drawOld: boolean = true, adjust: boolean = false): void {
	if (adjust) {
		sel = new Selection({...sel});
		sel.x = sel.x * Canvas.zoom - Canvas.pan.x;
		sel.y = sel.y * Canvas.zoom - Canvas.pan.y;
		sel.width *= Canvas.zoom;
		sel.height *= Canvas.zoom;
		if (sel.old && drawOld) {
			sel.old = new OldSelection({...sel.old});
			sel.old.x = sel.old.x * Canvas.zoom - Canvas.pan.x;
			sel.old.y = sel.old.y * Canvas.zoom - Canvas.pan.y;
			sel.old.width *= Canvas.zoom;
			sel.old.height *= Canvas.zoom;
		}
	} else {
		ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
	}

	// Previously selected area
	if (sel.old && drawOld)
		_drawDashedRect(ctx, 2, sel.old);

	// Selected image data
	if (sel.data)
		drawData(ctx, sel, adjust);

	// Selection box
	_drawDashedRect(ctx, 5, sel);

	if (handles) {
		// Selection resize handles
		// 0-1-2
		// 3   4
		// 5-6-7

		// FILL
		ctx.fillStyle = "#ffffff";
		// Top left
		ctx.fillRect(Math.round(sel.x - (HANDLE_SIZE / 2)), Math.round(sel.y - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// Top middle
		ctx.fillRect(Math.round(sel.x + (sel.width / 2) - (HANDLE_SIZE / 2)), Math.round(sel.y - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// Top right
		ctx.fillRect(Math.round(sel.x + sel.width - (HANDLE_SIZE / 2)), Math.round(sel.y - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// Left middle
		ctx.fillRect(Math.round(sel.x - (HANDLE_SIZE / 2)), Math.round(sel.y + (sel.height / 2) - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// Right middle
		ctx.fillRect(Math.round(sel.x + sel.width - (HANDLE_SIZE / 2)), Math.round(sel.y + (sel.height / 2) - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// Bottom left
		ctx.fillRect(Math.round(sel.x - (HANDLE_SIZE / 2)), Math.round(sel.y + sel.height - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// Bottom middle
		ctx.fillRect(Math.round(sel.x + (sel.width / 2) - (HANDLE_SIZE / 2)), Math.round(sel.y + sel.height - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// Bottom right
		ctx.fillRect(Math.round(sel.x + sel.width - (HANDLE_SIZE / 2)), Math.round(sel.y + sel.height - (HANDLE_SIZE / 2)),
			HANDLE_SIZE, HANDLE_SIZE);
		// STROKE
		ctx.strokeStyle = "#000000";
		// Top left
		ctx.strokeRect(Math.round(sel.x - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
		// Top middle
		ctx.strokeRect(Math.round(sel.x + (sel.width / 2) - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
		// Top right
		ctx.strokeRect(Math.round(sel.x + sel.width - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
		// Left middle
		ctx.strokeRect(Math.round(sel.x - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + (sel.height / 2) - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
		// Right middle
		ctx.strokeRect(Math.round(sel.x + sel.width - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + (sel.height / 2) - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
		// Bottom left
		ctx.strokeRect(Math.round(sel.x - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + sel.height - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
		// Bottom middle
		ctx.strokeRect(Math.round(sel.x + (sel.width / 2) - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + sel.height - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
		// Bottom right
		ctx.strokeRect(Math.round(sel.x + sel.width - (HANDLE_SIZE / 2)) + 0.5, Math.round(sel.y + sel.height - (HANDLE_SIZE / 2)) + 0.5,
			HANDLE_SIZE, HANDLE_SIZE);
	}

	if (!adjust)
		Canvas.update();
}

export function update(): void {
	const selection: Selection = Session.clients[Client.id].action.data;

	Canvas.update();
	updateSizeAndPos();

	// Send to other clients (remove unnecessary info too)
	Client.sendMessage({
		type: Message.SELECTION_UPDATE,
		selection: new ShortSelection({...selection}),
		clientId: Client.id,
	});
}

function updateSizeAndPos(): void {
	document.getElementById("selectionInfo").style.display = "";
	const selection: Action = Session.clients[Client.id].action;
	document.getElementById("selectPos").textContent = `${selection.data.x}, ${selection.data.y}`;
	document.getElementById("selectSize").textContent = `${selection.data.width}x${selection.data.height}`;
}

function drawData(ctx: CanvasRenderingContext2D, sel: Selection, adjust: boolean = false): void {
	const tempCanvas: HTMLCanvasElement = document.createElement("canvas");
	tempCanvas.width = sel.data.width;
	tempCanvas.height = sel.data.height;
	const tempCtx: CanvasRenderingContext2D = tempCanvas.getContext("2d");
	tempCtx.putImageData(sel.data, 0, 0);

	ctx.imageSmoothingEnabled = false;
	if (adjust) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(Math.round(-Canvas.pan.x), Math.round(-Canvas.pan.y), Math.round(Session.canvas.width * Canvas.zoom), Math.round(Session.canvas.height * Canvas.zoom));
		ctx.clip();
	}
	ctx.translate(sel.flipped.x ? sel.width : 0, sel.flipped.y ? sel.height : 0);
	ctx.scale(sel.flipped.x ? -1 : 1, sel.flipped.y ? -1 : 1);
	const x: number = sel.x * (sel.flipped.x ? -1 : 1);
	const y: number = sel.y * (sel.flipped.y ? -1 : 1);
	ctx.drawImage(tempCanvas, x, y, sel.width, sel.height);
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	if (adjust)
		ctx.restore();
	else
		Canvas.update();
}

export function cut(ctx: CanvasRenderingContext2D, sel: Selection, colour: string): void {
	copy(ctx, sel);
	clear(sel, colour);
}

export function copy(ctx: CanvasRenderingContext2D, sel: Selection): void {
	sel.data = Session.ctx.getImageData(sel.x, sel.y, sel.width, sel.height);
	draw(ctx, sel, true);
}

export function paste(sel: Selection, user: boolean = true): void {
	if (sel.data)
		drawData(Session.ctx, sel);
	if (user) {
		ActionHistory.append(PastActionType.SELECTION_PASTE, new SelectionPaste({
			x: sel.x,
			y: sel.y,
			width: sel.width,
			height: sel.height,
			flipped: sel.flipped,
			data: sel.data,
		}));
	}
}

export function clear(sel: Selection, colour: string, user: boolean = true): void {
	Session.ctx.fillStyle = colour;
	Session.ctx.fillRect(sel.x, sel.y, sel.width, sel.height);
	Canvas.update();
	if (user) {
		ActionHistory.append(PastActionType.SELECTION_CLEAR, new ColourRect({
			x: sel.x,
			y: sel.y,
			width: sel.width,
			height: sel.height,
			colour: colour,
		}));
	}
}

export function doCopy(): void {
	if (!Session.clients[Client.id].action.data.selected)
		return;
	Client.sendMessage({
		type: Message.SELECTION_COPY,
		clientId: Client.id,
	});
	copy(Client.ctx, Session.clients[Client.id].action.data);
}

export function doCut(): void {
	if (!Session.clients[Client.id].action.data.selected)
		return;
	Client.sendMessage({
		type: Message.SELECTION_CUT,
		colour: Colour.currents[1],
		clientId: Client.id,
	});
	cut(Client.ctx, Session.clients[Client.id].action.data, Colour.currents[1]);
}

export function doPaste(): void {
	if (!Session.clients[Client.id].action.data.selected || !Session.clients[Client.id].action.data.data)
		return;
	Client.sendMessage({
		type: Message.SELECTION_PASTE,
		clientId: Client.id,
	});
	paste(Session.clients[Client.id].action.data);
}

export function remove(): void {
	Client.sendMessage({
		type: Message.SELECTION_REMOVE,
		clientId: Client.id,
	});
	Session.clients[Client.id].action = {...Action.NULL};
	Session.endClientAction(Client.id);
	document.getElementById("selectionInfo").style.display = "none";
	Canvas.update();
}

export function importImage(src, clientId: string): void {
	const img: HTMLImageElement = new Image();
	img.addEventListener("load", () => {
		if (clientId === Client.id) {
			Client.sendMessage({
				type: Message.IMPORT_IMAGE,
				image: img.src,
				clientId: Client.id,
			});
		}
		const tempCanvas: HTMLCanvasElement = document.createElement("canvas");
		const tempCtx: CanvasRenderingContext2D = tempCanvas.getContext("2d");
		tempCanvas.width = img.width;
		tempCanvas.height = img.height;
		tempCtx.drawImage(img, 0, 0);
		const data: ImageData = tempCtx.getImageData(0, 0, img.width, img.height);

		const selection: Selection = new Selection({
			selected: true,
			x: 0,
			y: 0,
			width: data.width,
			height: data.height,
			move: new Vector2<number>(null, null),
			resize: new SelectionResize({
				handle: null,
				x: null,
				y: null,
			}),
			flipped: new Vector2<boolean>(false, false),
			data: data,
			old: null,
		});
		Session.startClientAction(clientId, new Action({
			type: null, // Not editing the selection, but it should exist
			data: selection,
		}));
		draw(Session.clients[clientId].ctx, selection, clientId === Client.id, false);
		if (clientId === Client.id)
			updateSizeAndPos();
	});
	img.src = src;
}

export function adjustSizeAbsolute(): void {
	const action: Action = Session.clients[Client.id].action;
	const selection: Selection = action.data;

	if (selection.width < 0) {
		selection.x += selection.width;
		selection.width = Math.abs(selection.width);
		if (selection.data)
			selection.flipped.x = !selection.flipped.x;
		if (action.type === ActionType.SELECTION_RESIZE) {
			switch (selection.resize.handle) {
				case 0: {
					selection.resize.handle = 2;
					break;
				}
				case 2: {
					selection.resize.handle = 0;
					break;
				}
				case 3: {
					selection.resize.handle = 4;
					break;
				}
				case 4: {
					selection.resize.handle = 3;
					break;
				}
				case 5: {
					selection.resize.handle = 7;
					break;
				}
				case 7: {
					selection.resize.handle = 5;
					break;
				}
			}
		}
	}
	if (selection.height < 0) {
		selection.y += selection.height;
		selection.height = Math.abs(selection.height);
		if (selection.data)
			selection.flipped.y = !selection.flipped.y;
		if (action.type === ActionType.SELECTION_RESIZE) {
			switch (selection.resize.handle) {
				case 0: {
					selection.resize.handle = 5;
					break;
				}
				case 5: {
					selection.resize.handle = 0;
					break;
				}
				case 1: {
					selection.resize.handle = 6;
					break;
				}
				case 6: {
					selection.resize.handle = 1;
					break;
				}
				case 2: {
					selection.resize.handle = 7;
					break;
				}
				case 7: {
					selection.resize.handle = 2;
					break;
				}
			}
		}
	}
	Session.clients[Client.id].action = action;
}
