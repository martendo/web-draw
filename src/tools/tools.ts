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

import {Message} from "../message";
import * as ActionHistory from "../action-history";
import {PastActionType} from "../action-history";
import * as Canvas from "../canvas";
import * as Client from "../client";
import * as Colour from "../colour";
import {ColourArray} from "../colour";
import * as Session from "../session";
import {Action, ActionType} from "../session";
import * as Slider from "../ui/slider";
import * as EllipseTool from "./ellipse";
import * as FillTool from "./fill";
import {Fill} from "./fill";
import * as LineTool from "./line";
import {Line} from "./line";
import * as PenTool from "./pen";
import {Stroke} from "./pen";
import * as RectTool from "./rect";
import * as SelectTool from "./selection";
import {Selection, SelectionResize} from "./selection";
import {Shape, ShapeColours} from "./shape";
import {Vector2, isPointInside} from "../helpers";

type Tool = "pen" | "eraser" | "fill" | "colourPicker" | "select" | "line" | "rect" | "ellipse";

export const NAMES: readonly Tool[] = [
	"pen",
	"eraser",
	"fill",
	"colourPicker",
	"select",
	"line",
	"rect",
	"ellipse",
];

interface ToolSetting {
	value?: {[key: string]: string};
	slider?: {[key: string]: number};
	checked?: {[key: string]: boolean};
}

// `value`: Value goes in `value` attribute (select)
// `slider`: Set with `Slider.setValue()`, get with `data-value` attribute (slider)
// `checked`: Use `checked` flag (checkbox)
const settings: {[key: string]: ToolSetting} = {};

export let currentTool: Tool = "pen";
// Indices into Colour.currents for the current action
let primary: 0 | 1 = 0;
let secondary: 0 | 1 = 1;

export function initToolSettings(): void {
	settings.pen = {
		value: {
			"compositeSelect": Canvas.CompositeOp[Canvas.DEFAULT_COMP_OP],
			"lineCapSelect": Canvas.LineCap[Canvas.DEFAULT_LINE_CAP],
		},
		slider: {
			"opacity": 100,
			"size": 10,
		},
		checked: {
			"smoothenStrokes": true,
		},
	};
	settings.eraser = {
		value: {
			"lineCapSelect": Canvas.LineCap[Canvas.DEFAULT_LINE_CAP],
		},
		slider: {
			"opacity": 100,
			"size": 10,
		},
		checked: {
			"smoothenStrokes": true,
			"eraseTransparent": true,
		},
	};
	settings.fill = {
		value: {
			"compositeSelect": Canvas.CompositeOp[Canvas.DEFAULT_COMP_OP],
			"fillBySelect": FillTool.FillBy[FillTool.DEFAULT_FILL_BY],
		},
		slider: {
			"opacity": 100,
			"fillThreshold": 15,
		},
	};
	settings.colourPicker = {
		checked: {
			"colourPickerMerge": false,
			"colourPickerOpacity": false,
		},
	};
	settings.line = {
		value: {
			"compositeSelect": Canvas.CompositeOp[Canvas.DEFAULT_COMP_OP],
			"lineCapSelect": Canvas.LineCap[Canvas.DEFAULT_LINE_CAP],
		},
		slider: {
			"opacity": 100,
			"size": 10,
		},
	};
	settings.rect = {
		value: {
			"compositeSelect": Canvas.CompositeOp[Canvas.DEFAULT_COMP_OP],
		},
		slider: {
			"opacity": 100,
			"size": 10,
		},
		checked: {
			"shapeOutline": true,
			"shapeFill": false,
		},
	};
	settings.ellipse = {
		value: {
			"compositeSelect": Canvas.CompositeOp[Canvas.DEFAULT_COMP_OP],
		},
		slider: {
			"opacity": 100,
			"size": 10,
		},
		checked: {
			"shapeOutline": true,
			"shapeFill": false,
		},
	};
}

// Save current tool's settings
function saveToolSettings(tool: Tool): void {
	if (!settings[tool])
		return;

	for (const [type, inputs] of Object.entries(settings[tool])) {
		for (const input of Object.keys(inputs)) {
			const element: HTMLElement = document.getElementById(input);
			switch (type) {
				case "value":
					inputs[input] = (element as HTMLSelectElement).value;
					break;
				case "slider":
					inputs[input] = document.getElementById(input + "Input").dataset.value;
					break;
				case "checked":
					inputs[input] = (element as HTMLInputElement).checked;
					break;
			}
		}
	}
}

// Set new tool's settings
export function loadToolSettings(tool: Tool): void {
	if (!settings[tool])
		return;

	for (const [type, inputs] of Object.entries(settings[tool])) {
		for (const input of Object.keys(inputs)) {
			const element: HTMLElement = document.getElementById(input);
			switch (type) {
				case "value":
					(element as HTMLSelectElement).value = inputs[input];
					break;
				case "slider":
					Slider.setValue(input, parseFloat(inputs[input]));
					break;
				case "checked":
					(element as HTMLInputElement).checked = inputs[input];
					break;
			}
		}
	}
}

// Handle mousedown on canvas
export function mouseHold(event: PointerEvent): void {
	if (!(event.target instanceof HTMLCanvasElement))
		return;

	// Scrollbars
	const mouse: Vector2<number> = Canvas.getCursorPos(event);
	if (mouse.y > Canvas.scrollbarX.trough.y) {
		event.preventDefault();
		if (Canvas.scrollbarX.thumb.x < mouse.x && mouse.x < Canvas.scrollbarX.thumb.x + Canvas.scrollbarX.thumb.width) {
			Canvas.scrollbarX.drag = {
				mouse: {...mouse},
				thumb: {
					x: Canvas.scrollbarX.thumb.x,
					y: Canvas.scrollbarX.thumb.y,
				},
				pan: {...Canvas.pan},
			};
		}
		return;
	} else if (mouse.x > Canvas.scrollbarY.trough.x) {
		event.preventDefault();
		if (Canvas.scrollbarY.thumb.y < mouse.y && mouse.y < Canvas.scrollbarY.thumb.y + Canvas.scrollbarY.thumb.height) {
			Canvas.scrollbarY.drag = {
				mouse: {...mouse},
				thumb: {
					x: Canvas.scrollbarY.thumb.x,
					y: Canvas.scrollbarY.thumb.y,
				},
				pan: {...Canvas.pan},
			};
		}
		return;
	}

	const point: Vector2<number> = Canvas.getPixelPos(event);

	switch (event.button) {
		case 0: {
			primary = 0;
			secondary = 1;
			break;
		}
		case 2: {
			primary = 1;
			secondary = 0;
			break;
		}
		default: {
			return;
		}
	}
	event.preventDefault();
	const currentAction: Action = Session.clients[Client.id].action;
	if (currentAction.data && currentAction.data.selected) {
		const handle: number = SelectTool.getResizeHandle<number>(mouse, [0, 1, 2, 3, 4, 5, 6, 7]);
		if (handle !== null) {
			const roundedPoint = Canvas.getPixelPos(event, {round: true});
			currentAction.data.resize = {
				handle: handle,
				x: roundedPoint.x,
				y: roundedPoint.y,
			};
			currentAction.data.old = {
				x: currentAction.data.x,
				y: currentAction.data.y,
				width: currentAction.data.width,
				height: currentAction.data.height,
			};
			currentAction.type = ActionType.SELECTION_RESIZE;
			Session.startClientAction(Client.id, currentAction);
			return;
		} else if (isPointInside(point.x, point.y, currentAction.data)) {
			currentAction.data.move = {
				x: point.x,
				y: point.y,
			};
			currentAction.type = ActionType.SELECTION_MOVE;
			Session.startClientAction(Client.id, currentAction);
			return;
		}
	}
	if (
		currentTool !== "select" && (
			point.x < 0 || point.x > Session.canvas.width
			|| point.y < 0 || point.y > Session.canvas.height
		)
	) {
		return;
	}
	startTool(point);
}

function startTool(point): void {
	Session.clients[Client.id].action.type = null;

	const size: number = parseInt(document.getElementById("sizeInput").dataset.value, 10);
	const opacity: number = parseFloat(document.getElementById("opacityInput").dataset.value) / 100;
	let compOp: Canvas.CompositeOp = Canvas.CompositeOp[(document.getElementById("compositeSelect") as HTMLSelectElement).value];
	const shapeOutline: boolean = (document.getElementById("shapeOutline") as HTMLInputElement).checked;
	const shapeFill: boolean = (document.getElementById("shapeFill") as HTMLInputElement).checked;
	const caps: Canvas.LineCap = Canvas.LineCap[(document.getElementById("lineCapSelect") as HTMLSelectElement).value];
	const smoothen: boolean = (document.getElementById("smoothenStrokes") as HTMLInputElement).checked;
	let colour: string = Colour.currents[primary];

	if (currentTool !== "select")
		SelectTool.remove();

	switch (currentTool) {
		case "eraser":
			if ((document.getElementById("eraseTransparent") as HTMLInputElement).checked) {
				compOp = Canvas.CompositeOp.DESTINATION_OUT;
			} else {
				colour = Colour.currents[secondary];
				compOp = Canvas.CompositeOp.SOURCE_OVER;
			}
			// Fall-through
		case "pen":
			Session.startClientAction(Client.id, new Action({
				type: ActionType.STROKE,
				data: new Stroke({
					points: [],
					colour: colour,
					size: size,
					caps: caps,
					opacity: opacity,
					compOp: compOp,
					smoothen: smoothen,
				}),
			}));
			Client.sendMessage({
				type: Message.START_STROKE,
				clientId: Client.id,
				action: Session.clients[Client.id].action,
			});
			PenTool.draw(point.x, point.y);
			break;
		case "fill":
			const fill: Fill = new Fill({
				x: point.x,
				y: point.y,
				colour: colour,
				threshold: parseInt(document.getElementById("fillThresholdInput").dataset.value, 10),
				opacity: opacity,
				compOp: compOp,
				fillBy: FillTool.FillBy[(document.getElementById("fillBySelect") as HTMLSelectElement).value],
			});
			Client.sendMessage({
				type: Message.FILL,
				fill: fill,
			});
			FillTool.fill(fill);
			break;
		case "colourPicker":
			const pixelColour: ColourArray = Session.ctx.getImageData(point.x, point.y, 1, 1).data as unknown as ColourArray;
			const merge: boolean = (document.getElementById("colourPickerMerge") as HTMLInputElement).checked;
			let newColour: ColourArray = [0, 0, 0, 0];
			if (merge) {
				const rgbColour: ColourArray = Colour.hexToRgb(colour);
				for (let i: number = 0; i < 3; i++)
					newColour[i] = Math.round((pixelColour[i] + rgbColour[i]) / 2);
			} else {
				newColour = pixelColour;
			}
			Colour.change(primary, Colour.rgbToHex(newColour));
			if ((document.getElementById("colourPickerOpacity") as HTMLInputElement).checked) {
				let newOpacity: number = (pixelColour[3] / 255) * 100;
				if (merge)
					newOpacity = (newOpacity + (opacity * 100)) / 2;
				Slider.setValue("opacity", newOpacity);
			}
			break;
		case "select":
			const selection: Selection = new Selection({
				selected: false,
				x: point.x,
				y: point.y,
				width: 0,
				height: 0,
				move: new Vector2<number>(null, null),
				resize: new SelectionResize({
					handle: null,
					x: null,
					y: null,
				}),
				flipped: new Vector2<boolean>(false, false),
				data: null,
				old: null,
			});
			Client.sendMessage({
				type: Message.SELECTION_CREATE,
				clientId: Client.id,
				selection: selection,
			});
			Session.startClientAction(Client.id, new Action({
				type: ActionType.SELECTING,
				data: selection,
			}));
			break;
		case "line":
			Session.startClientAction(Client.id, new Action({
				type: ActionType.LINE,
				data: new Line({
					x0: point.x,
					y0: point.y,
					x1: point.x,
					y1: point.y,
					colour: Colour.currents[primary],
					width: size,
					caps: caps,
					opacity: opacity,
					compOp: compOp,
				}),
			}));
			break;
		case "rect":
			if (!shapeOutline && !shapeFill)
				break;
			Session.startClientAction(Client.id, new Action({
				type: ActionType.RECT,
				data: new Shape({
					x: point.x,
					y: point.y,
					width: 0,
					height: 0,
					colours: new ShapeColours({
						outline: Colour.currents[primary],
						fill: Colour.currents[secondary],
					}),
					lineWidth: size,
					opacity: opacity,
					compOp: compOp,
					outline: shapeOutline,
					fill: shapeFill,
				}),
			}));
			break;
		case "ellipse":
			if (!shapeOutline && !shapeFill)
				break;
			Session.startClientAction(Client.id, new Action({
				type: ActionType.ELLIPSE,
				data: new Shape({
					x: point.x,
					y: point.y,
					width: 0,
					height: 0,
					colours: new ShapeColours({
						outline: Colour.currents[primary],
						fill: Colour.currents[secondary],
					}),
					lineWidth: size,
					opacity: opacity,
					compOp: compOp,
					outline: shapeOutline,
					fill: shapeFill,
				}),
			}));
			break;
	}
}

// Handle mousemove (prepare update and add point to stroke if drawing)
export function mouseMove(event): void {
	// If not on the drawing "page", ignore
	if (!document.getElementById("drawScreen").contains(event.target))
		return;

	const point: Vector2<number> = Canvas.getPixelPos(event);
	const posInfo: HTMLSpanElement = document.getElementById("cursorPos");
	posInfo.textContent = `${point.x}, ${point.y}`;
	if (point.x >= 0 && point.x < Session.canvas.width && point.y >= 0 && point.y < Session.canvas.height)
		posInfo.classList.remove("disabled")
	else
		posInfo.classList.add("disabled");

	const mouse: Vector2<number> = Canvas.getCursorPos(event);
	if (Canvas.scrollbarX.drag) {
		event.preventDefault();
		Canvas.pan.x = ((Canvas.scrollbarX.drag.thumb.x + (mouse.x - Canvas.scrollbarX.drag.mouse.x)) / (Canvas.scrollbarX.trough.width - 2)) * (Session.canvas.width * Canvas.zoom);
		Canvas.drawCanvas();
		return;
	} else if (Canvas.scrollbarY.drag) {
		event.preventDefault();
		Canvas.pan.y = ((Canvas.scrollbarY.drag.thumb.y + (mouse.y - Canvas.scrollbarY.drag.mouse.y)) / (Canvas.scrollbarY.trough.height - 2)) * (Session.canvas.height * Canvas.zoom);
		Canvas.drawCanvas();
		return;
	}

	const currentAction: Action = Session.clients[Client.id].action;
	const roundedPoint: Vector2<number> = Canvas.getPixelPos(event, {round: true});
	switch (currentAction.type) {
		case ActionType.STROKE: {
			event.preventDefault();
			PenTool.draw(point.x, point.y);
			break;
		}
		case ActionType.LINE: {
			event.preventDefault();
			currentAction.data.x1 = point.x, currentAction.data.y1 = point.y;
			Client.sendMessage({
				type: Message.LINE,
				clientId: Client.id,
				line: currentAction.data,
			});
			Session.clients[Client.id].action = currentAction;
			LineTool.draw(currentAction.data, Client.ctx);
			break;
		}
		case ActionType.RECT: {
			event.preventDefault();
			currentAction.data.width = point.x - currentAction.data.x;
			currentAction.data.height = point.y - currentAction.data.y;
			Client.sendMessage({
				type: Message.RECT,
				clientId: Client.id,
				rect: currentAction.data,
			});
			Session.clients[Client.id].action = currentAction;
			RectTool.draw(currentAction.data, Client.ctx);
			break;
		}
		case ActionType.ELLIPSE: {
			event.preventDefault();
			currentAction.data.width = point.x - currentAction.data.x;
			currentAction.data.height = point.y - currentAction.data.y;
			Client.sendMessage({
				type: Message.ELLIPSE,
				clientId: Client.id,
				ellipse: currentAction.data,
			});
			Session.clients[Client.id].action = currentAction;
			EllipseTool.draw(currentAction.data, Client.ctx);
			break;
		}
		case ActionType.SELECTING: {
			event.preventDefault();
			currentAction.data.width = roundedPoint.x - currentAction.data.x;
			currentAction.data.height = roundedPoint.y - currentAction.data.y;
			Session.clients[Client.id].action = currentAction;
			SelectTool.update();
			break;
		}
		case ActionType.SELECTION_MOVE: {
			event.preventDefault();
			currentAction.data.x += roundedPoint.x - currentAction.data.move.x;
			currentAction.data.y += roundedPoint.y - currentAction.data.move.y;
			currentAction.data.move.x = roundedPoint.x;
			currentAction.data.move.y = roundedPoint.y;
			Session.clients[Client.id].action = currentAction;
			SelectTool.update();
			break;
		}
		case ActionType.SELECTION_RESIZE: {
			event.preventDefault();
			// 0-1-2
			// 3   4
			// 5-6-7
			let changeX: number = 0;
			let changeY: number = 0;
			let changeW: number = 0;
			let changeH: number = 0;
			switch (currentAction.data.resize.handle) {
				case 0:
					changeX = changeW = changeY = changeH = -1;
					break;
				case 1:
					changeY = changeH = -1;
					break;
				case 2:
					changeY = changeH = -1;
					changeW = 1;
					break;
				case 3:
					changeX = changeW = -1;
					break;
				case 4:
					changeW = 1;
					break;
				case 5:
					changeX = changeW = -1;
					changeH = 1;
					break;
				case 6:
					changeH = 1;
					break;
				case 7:
					changeH = changeW = 1;
					break;
			}
			const dx: number = roundedPoint.x - currentAction.data.resize.x;
			const dy: number = roundedPoint.y - currentAction.data.resize.y;
			currentAction.data.width += dx * changeW;
			currentAction.data.x -= dx * changeX;
			currentAction.data.height += dy * changeH;
			currentAction.data.y -= dy * changeY;
			currentAction.data.resize.x = roundedPoint.x;
			currentAction.data.resize.y = roundedPoint.y;
			Session.clients[Client.id].action = currentAction;
			SelectTool.adjustSizeAbsolute();
			SelectTool.update();
			break;
		}
	}

	const exactPoint = Canvas.getPixelPos(event, {floor: false});

	let cursor: string = "auto";
	if (currentAction.data && currentAction.data.selected) {
		if (currentAction.type === ActionType.SELECTION_RESIZE) {
			// Always use resizing cursors
			cursor = SelectTool.RESIZE_CURSORS[currentAction.data.resize.handle];
		} else if (currentAction.type === ActionType.SELECTION_MOVE) {
			// Always use move cursor
			cursor = "move";
		} else {
			const resizeCursor: string = SelectTool.getResizeHandle<string>(mouse, SelectTool.RESIZE_CURSORS);
			if (resizeCursor !== null)
				cursor = resizeCursor;
			else if (isPointInside(exactPoint.x, exactPoint.y, currentAction.data))
				cursor = "move";
		}
	}
	Canvas.displayCanvas.style.cursor = cursor;

	Client.mouseMoved.moved = true;
	if (event.target.tagName !== "CANVAS") {
		Client.mouseMoved.x = -1;
	} else {
		Client.mouseMoved.x = exactPoint.x;
		Client.mouseMoved.y = exactPoint.y;
	}
}

// Handle mouseup
export function clearMouseHold(event): void {
	if (!Session.clients.hasOwnProperty(Client.id))
		return;

	Canvas.scrollbarX.drag = null;
	Canvas.scrollbarY.drag = null;

	const currentAction: Action = Session.clients[Client.id].action;
	let keepAction: boolean = false;
	switch (currentAction.type) {
		case ActionType.STROKE:
			event.preventDefault();
			const point: Vector2<number> = Canvas.getPixelPos(event);
			PenTool.draw(point.x, point.y);
			Client.sendMessage({
				type: Message.END_STROKE,
				clientId: Client.id,
			});
			PenTool.commitStroke(Client.canvas, currentAction.data);
			break;
		case ActionType.LINE:
			event.preventDefault();
			Client.sendMessage({
				type: Message.COMMIT_LINE,
				line: currentAction.data,
				clientId: Client.id,
			});
			Canvas.update({save: true});
			Client.ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
			ActionHistory.append(PastActionType.LINE, currentAction.data);
			break;
		case ActionType.RECT:
			event.preventDefault();
			Client.sendMessage({
				type: Message.COMMIT_RECT,
				rect: currentAction.data,
				clientId: Client.id,
			});
			Canvas.update({save: true});
			Client.ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
			ActionHistory.append(PastActionType.RECT, currentAction.data);
			break;
		case ActionType.ELLIPSE:
			event.preventDefault();
			Client.sendMessage({
				type: Message.COMMIT_ELLIPSE,
				ellipse: currentAction.data,
				clientId: Client.id,
			});
			Canvas.update({save: true});
			Client.ctx.clearRect(0, 0, Client.canvas.width, Client.canvas.height);
			ActionHistory.append(PastActionType.ELLIPSE, currentAction.data);
			break;
		case ActionType.SELECTING:
			event.preventDefault();
			if (currentAction.data.width && currentAction.data.height) {
				currentAction.data.selected = true;
				Session.clients[Client.id].action = currentAction;
				SelectTool.adjustSizeAbsolute();
				SelectTool.draw(Client.ctx, Session.clients[Client.id].action.data, true);
				keepAction = true;
			} else {
				SelectTool.remove();
			}
			break;
		case ActionType.SELECTION_MOVE:
		case ActionType.SELECTION_RESIZE:
			event.preventDefault();
			if (!(currentAction.data.width && currentAction.data.height)) {
				currentAction.data.x = currentAction.data.old.x;
				currentAction.data.y = currentAction.data.old.y;
				currentAction.data.width = currentAction.data.old.width;
				currentAction.data.height = currentAction.data.old.height;
				Session.clients[Client.id].action = currentAction;
			}
			delete Session.clients[Client.id].action.data.old;
			SelectTool.draw(Client.ctx, Session.clients[Client.id].action.data, true);
			keepAction = true;
			break;
		default:
			keepAction = true;
			break;
	}
	Session.clients[Client.id].action.type = null;
	if (!keepAction)
		Session.endClientAction(Client.id);
	Canvas.update();
}

// Switch the current tool
export function switchTool(newTool: Tool): void {
	saveToolSettings(currentTool);
	loadToolSettings(newTool);

	currentTool = newTool;

	for (const toolName of NAMES) {
		document.getElementById(toolName + "Btn").classList.remove("btnSelected");
		const settings: HTMLCollectionOf<HTMLTableRowElement> = document.getElementsByClassName(toolName + "Settings") as HTMLCollectionOf<HTMLTableRowElement>;
		if (settings) {
			for (let s: number = 0; s < settings.length; s++)
				settings[s].classList.remove("currentToolSettings");
		}
	}
	document.getElementById(currentTool + "Btn").classList.add("btnSelected");
	const settings: HTMLCollectionOf<HTMLTableRowElement> = document.getElementsByClassName(currentTool + "Settings") as HTMLCollectionOf<HTMLTableRowElement>;
	if (settings) {
		for (let s: number = 0; s < settings.length; s++)
			settings[s].classList.add("currentToolSettings");
	}
	SelectTool.remove();
}
