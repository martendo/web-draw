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
import {Message} from "./message";
import * as ActionHistory from "./action-history";
import {PastAction, PastActionType} from "./action-history";
import * as Colour from "./colour";
import * as Client from "./client";
import * as Images from "./images";
import * as Modal from "./ui/modal";
import * as Session from "./session";
import {Action, ActionType, Member} from "./session";
import * as SelectTool from "./tools/selection";
import * as Tools from "./tools/tools";
import {Vector2, DOCUMENT_STYLE, minmax} from "./helpers";

export class ColourRect {
	x: number;
	y: number;
	width: number;
	height: number;
	colour: string;

	constructor({x, y, width, height, colour}: ColourRect) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
		this.colour = colour;
	}

	static packer(rect: ColourRect): Uint8Array {
		return msgpack.encode([
			rect.x,
			rect.y,
			rect.width,
			rect.height,
			rect.colour,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): ColourRect {
		const properties: [number, number, number, number, string] = msgpack.decode([0x95, ...new Uint8Array(buffer)]);
		return new ColourRect({
			x: properties[0],
			y: properties[1],
			width: properties[2],
			height: properties[3],
			colour: properties[4],
		});
	}
}

// Starting canvas dimensions
const CANVAS_WIDTH: number = 800;
const CANVAS_HEIGHT: number = 600;

export const DEFAULT_ZOOM: number = 1;
const MIN_ZOOM: number = 0;

const SCROLLBAR_WIDTH: number = 15;
const SCROLLBAR_THUMB_MIN_SIZE: number = 15 * 2;

// Pen stroke and line cap options
export enum LineCap {
	ROUND,
	BUTT,
	SQUARE,
}
// Pen stroke and line cap values
export const CAPS: readonly CanvasLineCap[] = [
	"round",
	"butt",
	"square",
];
export const DEFAULT_LINE_CAP: LineCap = LineCap.ROUND;

// Canvas globalCompositeOperation options
export enum CompositeOp {
	SOURCE_OVER,
	DESTINATION_OVER,
	DESTINATION_OUT,
	LIGHTEN,
	SCREEN,
	COLOR_DODGE,
	LIGHTER,
	DARKEN,
	COLOR_BURN,
	MULTIPLY,
	OVERLAY,
	HARD_LIGHT,
	SOFT_LIGHT,
	DIFFERENCE,
	EXCLUSION,
	SOURCE_IN,
	SOURCE_OUT,
	SOURCE_ATOP,
	DESTINATION_IN,
	DESTINATION_ATOP,
	XOR,
	COPY,
	HUE,
	SATURATION,
	COLOR,
	LUMINOSITY,
}
// Canvas globalCompositeOperation values
const COMP_OPS: readonly string[] = [
	"source-over",
	"destination-over",
	"destination-out",
	"lighten",
	"screen",
	"color-dodge",
	"lighter",
	"darken",
	"color-burn",
	"multiply",
	"overlay",
	"hard-light",
	"soft-light",
	"difference",
	"exclusion",
	"source-in",
	"source-out",
	"source-atop",
	"destination-in",
	"destination-atop",
	"xor",
	"copy",
	"hue",
	"saturation",
	"color",
	"luminosity",
];
export const DEFAULT_COMP_OP: CompositeOp = CompositeOp.SOURCE_OVER;

export let zoom: number = null;
export const pan: Vector2<number> = new Vector2<number>(0, 0);
export const scrollbarX = {
	trough: null,
	thumb: null,
	drag: null,
};
export const scrollbarY = {
	trough: null,
	thumb: null,
	drag: null,
};
const canvasArea = {
	width: 0,
	height: 0,
};

const container: HTMLElement = document.getElementById("canvasContainer");
export const displayCanvas: HTMLCanvasElement = document.getElementById("displayCanvas") as HTMLCanvasElement;
const displayCtx: CanvasRenderingContext2D = displayCanvas.getContext("2d");
const mixingCanvas: HTMLCanvasElement = document.createElement("canvas");
const mixingCtx: CanvasRenderingContext2D = mixingCanvas.getContext("2d");

export let transparentPattern: CanvasPattern = null;
const transparentImg: HTMLImageElement = new Image();
transparentImg.addEventListener("load", () => {
	transparentPattern = displayCtx.createPattern(transparentImg, "repeat");
});
transparentImg.src = Images.TRANSPARENT;

export function init(): void {
	// Set canvas size
	Session.canvas.width = CANVAS_WIDTH;
	Session.canvas.height = CANVAS_HEIGHT;
	mixingCanvas.width = CANVAS_WIDTH;
	mixingCanvas.height = CANVAS_HEIGHT;
	displayCanvas.width = container.clientWidth;
	displayCanvas.height = container.clientHeight;
	for (const client of Object.values(Session.clients)) {
		client.canvas.width = CANVAS_WIDTH;
		client.canvas.height = CANVAS_HEIGHT;
	}
	// Start with the canvas cleared
	clearBlank(false);
}

// Zoom the canvas with the mouse wheel
export function changeZoom(delta: number): void {
	if (zoom + delta < MIN_ZOOM)
		return;
	const oldPixelPos = getPixelPos(Client.cachedMouseEvent, {floor: false});
	zoom += delta;
	const newPixelPos = getPixelPos(Client.cachedMouseEvent, {floor: false});
	pan.x += (oldPixelPos.x - newPixelPos.x) * zoom;
	pan.y += (oldPixelPos.y - newPixelPos.y) * zoom;

	setZoom(zoom);
}

// Set the canvas zoom with the number input
export function setZoomValue(event: InputEvent): void {
	setZoom(parseFloat((event.currentTarget as HTMLInputElement).value) / 100, true);
}

// Set the canvas zoom to whatever fits in the canvas area, optionally only if it doesn't already fit
export function zoomToWindow(type: string = "fit", allowLarger: boolean = true): void {
	const widthZoom: number = canvasArea.width / Session.canvas.width;
	const heightZoom: number = canvasArea.height / Session.canvas.height;
	const fitZoom: number = type === "fit" ? Math.min(widthZoom, heightZoom) : Math.max(widthZoom, heightZoom);
	const newZoom: number = (fitZoom < zoom || allowLarger) ? fitZoom : zoom;
	setZoom(newZoom);
}

// Set the canvas zoom
export function setZoom(newZoom: number, keepCentre: boolean = false): void {
	if (keepCentre) {
		const centre: Vector2<number> = new Vector2<number>(
			(canvasArea.width / 2) + pan.x,
			(canvasArea.height / 2) + pan.y,
		);
		const oldCentre: Vector2<number> = new Vector2<number>(
			centre.x / zoom,
			centre.y / zoom,
		);
		zoom = newZoom;
		pan.x += (oldCentre.x - (centre.x / zoom)) * zoom;
		pan.y += (oldCentre.y - (centre.y / zoom)) * zoom;
	} else {
		zoom = newZoom;
	}
	(document.getElementById("canvasZoom") as HTMLInputElement).value = Math.round(zoom * 100).toString();
	drawCanvas();
}

export function update({extras = [], save = false, only = null} = {}) {
	mixingCanvas.width = Session.canvas.width;
	mixingCanvas.height = Session.canvas.height;
	mixingCtx.drawImage(Session.canvas, 0, 0);

	if (only) {
		// Used in ActionHistory
		mixingCtx.globalCompositeOperation = COMP_OPS[only.compOp];
		mixingCtx.drawImage(Session.clients[only.id].canvas, 0, 0);
	} else {
		for (const clientId of Session.actionOrder) {
			const client: Member = Session.clients[clientId];
			// Selections are not part of the actual image
			// Type is only null when a selection is present but not currently being modified
			const type: ActionType = client.action.type;
			if (type === null || type === ActionType.SELECTING || type === ActionType.SELECTION_MOVE || type === ActionType.SELECTION_RESIZE)
				continue;

			mixingCtx.globalCompositeOperation = COMP_OPS[client.action.data.compOp || DEFAULT_COMP_OP];
			mixingCtx.drawImage(client.canvas, 0, 0);
		}
		for (const extra of extras) {
			mixingCtx.globalCompositeOperation = COMP_OPS[extra.compOp];
			mixingCtx.drawImage(extra.canvas, 0, 0);
		}
	}
	mixingCtx.globalCompositeOperation = COMP_OPS[DEFAULT_COMP_OP];
	if (save) {
		Session.ctx.clearRect(0, 0, Session.canvas.width, Session.canvas.height);
		Session.ctx.drawImage(mixingCanvas, 0, 0);
	}
	drawCanvas();
}

export function drawCanvas(): void {
	displayCtx.imageSmoothingEnabled = false;
	// "Background" - extra space not filled with canvas
	displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--background-1-colour");
	displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);

	const width: number = Session.canvas.width * zoom;
	const height: number = Session.canvas.height * zoom;
	canvasArea.width = displayCanvas.width - SCROLLBAR_WIDTH;
	canvasArea.height = displayCanvas.height - SCROLLBAR_WIDTH;

	// Ensure canvas is visible
	pan.x = minmax(pan.x, 0, width - canvasArea.width);
	pan.y = minmax(pan.y, 0, height - canvasArea.height);

	// Calculate scroll bar positions and dimensions
	scrollbarX.trough = {
		x: 0,
		y: displayCanvas.height - SCROLLBAR_WIDTH,
		width: canvasArea.width,
		height: SCROLLBAR_WIDTH,
	};
	scrollbarX.thumb = {
		x: (pan.x / Session.canvas.width) * ((scrollbarX.trough.width - 2) / zoom) + 1,
		y: displayCanvas.height - SCROLLBAR_WIDTH + 1,
		width: minmax((canvasArea.width / Session.canvas.width) * ((scrollbarX.trough.width - 2) / zoom), SCROLLBAR_THUMB_MIN_SIZE, scrollbarX.trough.width - 2),
		height: SCROLLBAR_WIDTH - 2,
	};
	scrollbarY.trough = {
		x: displayCanvas.width - SCROLLBAR_WIDTH,
		y: 0,
		width: SCROLLBAR_WIDTH,
		height: canvasArea.height,
	};
	scrollbarY.thumb = {
		x: displayCanvas.width - SCROLLBAR_WIDTH + 1,
		y: (pan.y / Session.canvas.height) * ((scrollbarY.trough.height - 2) / zoom) + 1,
		width: SCROLLBAR_WIDTH - 2,
		height: minmax((canvasArea.height / Session.canvas.height) * ((scrollbarY.trough.height - 2) / zoom), SCROLLBAR_THUMB_MIN_SIZE, scrollbarY.trough.height - 2),
	};

	// Centre canvas in canvas area if smaller than it
	if (width < canvasArea.width) {
		pan.x = -((canvasArea.width - width) / 2);
		scrollbarX.thumb.x = 1;
		scrollbarX.thumb.width = scrollbarX.trough.width - 2;
	}
	if (height < canvasArea.height) {
		pan.y = -((canvasArea.height - height) / 2);
		scrollbarY.thumb.y = 1;
		scrollbarY.thumb.height = scrollbarY.trough.height - 2;
	}

	const imageRect: [number, number, number, number] = [Math.round(-pan.x), Math.round(-pan.y), Math.round(width), Math.round(height)];
	// Show transparency pattern under image
	displayCtx.fillStyle = transparentPattern;
	displayCtx.translate(imageRect[0], imageRect[1]);
	displayCtx.fillRect(0, 0, imageRect[2], imageRect[3]);
	displayCtx.setTransform(1, 0, 0, 1, 0, 0);
	// Actual image
	displayCtx.drawImage(mixingCanvas, ...imageRect);

	// Draw selections
	for (const clientId of Session.actionOrder) {
		const client: Member = Session.clients[clientId];
		const type: ActionType = client.action.type;
		if (type !== null && type !== ActionType.SELECTING && type !== ActionType.SELECTION_MOVE && type !== ActionType.SELECTION_RESIZE)
			continue;
		const handles: boolean = clientId === Client.id && type !== ActionType.SELECTING;
		SelectTool.draw(displayCtx, client.action.data, handles, clientId === Client.id, true);
	}

	// Border around image
	const imageBorderRect: [number, number, number, number] = [imageRect[0] + 0.5, imageRect[1] + 0.5, imageRect[2] - 1, imageRect[3] - 1];
	displayCtx.strokeStyle = "#ffff00";
	displayCtx.lineWidth = 1;
	displayCtx.setLineDash([5, 5]);
	displayCtx.lineDashOffset = 0.5;
	displayCtx.strokeRect(...imageBorderRect);
	displayCtx.strokeStyle = "#000000";
	displayCtx.lineDashOffset = 5.5;
	displayCtx.strokeRect(...imageBorderRect);
	displayCtx.setLineDash([]);

	// Draw scroll bars
	displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--scrollbar-trough-colour");
	displayCtx.fillRect(scrollbarX.trough.x, scrollbarX.trough.y, scrollbarX.trough.width, scrollbarX.trough.height);
	displayCtx.fillRect(scrollbarY.trough.x, scrollbarY.trough.y, scrollbarY.trough.width, scrollbarY.trough.height);

	displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--scrollbar-thumb-colour");
	displayCtx.fillRect(scrollbarX.thumb.x, scrollbarX.thumb.y, scrollbarX.thumb.width, scrollbarX.thumb.height);
	displayCtx.fillRect(scrollbarY.thumb.x, scrollbarY.thumb.y, scrollbarY.thumb.width, scrollbarY.thumb.height);

	displayCtx.fillStyle = DOCUMENT_STYLE.getPropertyValue("--scrollbar-corner-colour");
	displayCtx.fillRect(scrollbarX.trough.width, scrollbarY.trough.height, SCROLLBAR_WIDTH, SCROLLBAR_WIDTH);
}

export function updateCanvasAreaSize(): void {
	displayCanvas.width = container.clientWidth;
	displayCanvas.height = container.clientHeight;
	drawCanvas();
}

// Export canvas image
export function exportImage(): void {
	const a: HTMLAnchorElement = document.createElement("a");
	a.style.display = "none";
	a.href = Session.canvas.toDataURL("image/png");
	a.download = "image.png";
	a.click();
}

// Import image and create selection with image
export function importImage(event: Event): void {
	Tools.switchTool("select");
	const file: File = (event.currentTarget as HTMLInputElement).files[0];
	const reader: FileReader = new FileReader();
	reader.onerror = (event) => {
		window.alert("There was an error reading the file.\n\n" + reader.error);
		console.error(`Error reading file ${file}:`, event);
	};
	reader.onload = () => SelectTool.importImage(reader.result, Client.id);
	reader.readAsDataURL(file);
}

// Download canvas file
export function saveFile(): void {
	const a: HTMLAnchorElement = document.createElement("a");
	a.style.display = "none";
	const file: Blob = new Blob([msgpack.encode([
		ActionHistory.actions,
		ActionHistory.pos,
	]).slice(1)], {type: "application/octet-stream"});
	const url: string = URL.createObjectURL(file);
	a.href = url;
	a.download = "image.bin";
	a.click();
	URL.revokeObjectURL(url);
}

// Open canvas file and set up canvas
export function openFile(event: Event): void {
	const file: File = (event.currentTarget as HTMLInputElement).files[0];
	const reader: FileReader = new FileReader();
	reader.onerror = (event) => {
		window.alert("There was an error reading the file.\n\n" + reader.error);
		console.error(`Error reading file ${file}:`, event);
	};
	reader.onload = () => {
		Modal.open("retrieveModal");

		const backupActions: PastAction[] = ActionHistory.actions.slice();
		const backupPos: number = ActionHistory.pos;

		const data: Uint8Array = new Uint8Array(reader.result as ArrayBuffer);
		try {
			setup(msgpack.decode([0x92, ...data]));
			// Only send to other clients if setup was successful
			Client.sendMessage({
				type: Message.OPEN_CANVAS,
				file: data,
			});
		} catch (err) {
			console.error("Error setting up canvas: " + err);
			ActionHistory.replaceHistory(backupActions);
			ActionHistory.setPos(backupPos);
			ActionHistory.doAllActions();
			Modal.close("retrieveModal");
			Modal.open("oldCanvasFileModal");
		}
	};
	reader.readAsArrayBuffer(file);
}

export function setup([history, pos, [clientActions, actionOrder]]: [PastAction[], number, [Action[], string[]]]): void {
	init();
	// Zoom canvas to fit in canvas area if it doesn't already
	zoomToWindow("fit", false);
	ActionHistory.replaceHistory(history);
	ActionHistory.setPos(pos);
	if (clientActions) {
		for (const [clientId, action] of Object.entries(clientActions))
			Session.clients[clientId].action = action;
		Session.setActionOrder(actionOrder);
	}
	ActionHistory.doAllActions();
	Modal.close("retrieveModal");
}

// Get the position of the cursor relative to the canvas
export function getCursorPos(event: PointerEvent): Vector2<number> {
	let mouse: Vector2<number> = new Vector2<number>(0, 0);
	if (typeof event.clientX === "undefined") {
		mouse.x = (event as unknown as TouchEvent).changedTouches[0].clientX;
		mouse.y = (event as unknown as TouchEvent).changedTouches[0].clientY;
	} else {
		mouse.x = event.clientX;
		mouse.y = event.clientY;
	}
	mouse.x -= displayCanvas.offsetLeft;
	mouse.y -= displayCanvas.offsetTop;
	return mouse;
}

// Get the pixel position of the cursor on the canvas
export function getPixelPos(event: PointerEvent, {floor = true, round = false} = {}): Vector2<number> {
	let mouse: Vector2<number> = getCursorPos(event);
	mouse.x = (mouse.x + pan.x) / zoom;
	mouse.y = (mouse.y + pan.y) / zoom;
	if (round) {
		mouse.x = Math.round(mouse.x);
		mouse.y = Math.round(mouse.y);
	} else if (floor) {
		mouse.x |= 0;
		mouse.y |= 0;
	}
	return mouse;
}

function copyCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
	const newCanvas: HTMLCanvasElement = document.createElement("canvas");
	newCanvas.width = canvas.width;
	newCanvas.height = canvas.height;
	newCanvas.getContext("2d").drawImage(canvas, 0, 0);
	return newCanvas;
}

// Set the canvas size
export function resize(options, user: boolean = true): void {
	const sessionCanvasCopy: HTMLCanvasElement = copyCanvas(Session.canvas);
	const clientCanvasCopies: {[key: string]: HTMLCanvasElement} = {};
	for (const [clientId, client] of Object.entries(Session.clients))
		clientCanvasCopies[clientId] = copyCanvas(client.canvas);
	let changed: boolean = false;
	if (options.width !== Session.canvas.width) {
		Client.canvas.width = options.width;
		Session.canvas.width = options.width;
		for (const client of Object.values(Session.clients))
			client.canvas.width = options.width;
		changed = true;
	}
	if (options.height !== Session.canvas.height) {
		Client.canvas.height = options.height;
		Session.canvas.height = options.height;
		for (const client of Object.values(Session.clients))
			client.canvas.height = options.height;
		changed = true;
	}
	if (changed) {
		if (options.colour) {
			Session.ctx.fillStyle = options.colour;
			Session.ctx.fillRect(0, 0, Session.canvas.width, Session.canvas.height);
			Session.ctx.clearRect(options.x, options.y, sessionCanvasCopy.width, sessionCanvasCopy.height);
		}
		// Canvas already filled with background colour
		Session.ctx.drawImage(sessionCanvasCopy, options.x, options.y);

		for (const [clientId, client] of Object.entries(Session.clients))
			// Canvas already cleared from size change
			client.ctx.drawImage(clientCanvasCopies[clientId], options.x, options.y);
	}
	update();
	if (user)
		ActionHistory.append(PastActionType.RESIZE_CANVAS, options);
}

// Clear the (session) canvas to the blank colour
export function clearBlank(user: boolean = true): void {
	if (user) {
		Client.sendMessage({
			type: Message.CLEAR_BLANK,
		});
	}
	Session.ctx.fillStyle = Colour.BLANK;
	Session.ctx.fillRect(0, 0, Session.canvas.width, Session.canvas.height);
	update();
	if (user)
		ActionHistory.append(PastActionType.CLEAR_BLANK);
}

// Completely clear the (session) canvas
export function clear(user: boolean = true): void {
	if (user) {
		Client.sendMessage({
			type: Message.CLEAR,
		});
	}
	Session.ctx.clearRect(0, 0, Session.canvas.width, Session.canvas.height);
	update();
	if (user)
		ActionHistory.append(PastActionType.CLEAR);
}
