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
import * as Canvas from "./canvas";
import * as Client from "./client";
import * as Images from "./images";
import * as Session from "./session";
import * as EllipseTool from "./tools/ellipse";
import * as FillTool from "./tools/fill";
import * as LineTool from "./tools/line";
import * as PenTool from "./tools/pen";
import * as RectTool from "./tools/rect";
import * as SelectTool from "./tools/selection";

export const enum PastActionType {
	BASE,
	STROKE,
	FILL,
	SELECTION_CLEAR,
	SELECTION_PASTE,
	LINE,
	RECT,
	ELLIPSE,
	CLEAR,
	CLEAR_BLANK,
	RESIZE_CANVAS,
};

export class PastAction {
	enabled: boolean;
	type: PastActionType;
	data: any;

	constructor({enabled, type, data}: PastAction) {
		this.enabled = enabled;
		this.type = type;
		this.data = data;
	}

	static packer(action: PastAction): Uint8Array {
		return msgpack.encode([
			action.enabled,
			action.type,
			action.data,
		]).slice(1);
	}
	static unpacker(buffer: Uint8Array): PastAction {
		const properties: [boolean, PastActionType, any] = msgpack.decode([0x93, ...new Uint8Array(buffer)]);
		return new PastAction({
			enabled: properties[0],
			type: properties[1],
			data: properties[2],
		});
	}
}

// All actions made to the session canvas
export let actions: PastAction[] = [];
// The current position in history
export let pos: number = -1;

// Clear redoable actions, push an action onto action history, enable the undo button
export function append(type: PastActionType, data = null): void {
	clearRedo();
	actions.push(new PastAction({
		enabled: true,
		type: type,
		data: data,
	}));
	pos++;
	enableAvailableButtons();
	addActionToTable(type);
}

// Undo an action, and send a message to undo (from the user)
export function moveWithOffset(offset: number): void {
	let num: number = pos + offset;
	while (num >= 0 && num < actions.length && !actions[num].enabled)
		num += offset;
	if (num < 0 || num >= actions.length)
		return;
	Client.sendMessage({
		type: Message.MOVE_HISTORY,
		num: num,
	});
	moveTo(num);
}

// Undo/Redo an action
export function moveTo(num: number): void {
	if (num === pos)
		return;
	if (num < pos) {
		// Undo
		while (pos > num) {
			pos--;
			if (pos <= 0)
				break;
		}
		Canvas.init();
		for (let i: number = 0; i <= pos; i++)
			doAction(actions[i]);
	} else {
		// Redo
		while (num > pos) {
			pos++;
			if (pos >= actions.length)
				break;
			doAction(actions[pos]);
		}
	}
	Session.drawCurrentActions();
	updateLastAction();
	enableAvailableButtons();
}

export function toggleAction(num: number, user: boolean = true): boolean {
	if (user) {
		Client.sendMessage({
			type: Message.TOGGLE_ACTION,
			num: num,
		});
	}
	const action: PastAction = actions[num];
	action.enabled = !action.enabled;
	doAllActions();
	return action.enabled;
}

export function moveAction(num: number, offset: number, user: boolean = true): void {
	if (user) {
		Client.sendMessage({
			type: Message.MOVE_ACTION,
			num: num,
			offset: offset,
		});
	}
	const action: PastAction = actions.splice(num, 1)[0];
	num += offset;
	actions.splice(num, 0, action);
	doAllActions();
}

// Handle different types of actions
function doAction(action: PastAction): void {
	if (!action.enabled)
		return;

	switch (action.type) {
		case PastActionType.STROKE: {
			PenTool.drawStroke(Client.ctx, action.data, {
				save: true,
				only: {
					id: Client.id,
					compOp: action.data.compOp,
				},
			});
			break;
		}
		case PastActionType.FILL: {
			FillTool.fill(action.data, false);
			break;
		}
		case PastActionType.CLEAR: {
			Canvas.clear(false);
			break;
		}
		case PastActionType.CLEAR_BLANK: {
			Canvas.clearBlank(false);
			break;
		}
		case PastActionType.RESIZE_CANVAS: {
			Canvas.resize(action.data, false);
			break;
		}
		case PastActionType.SELECTION_CLEAR: {
			SelectTool.clear(action.data, action.data.colour, false);
			break;
		}
		case PastActionType.SELECTION_PASTE: {
			SelectTool.paste(action.data, false);
			break;
		}
		case PastActionType.LINE: {
			LineTool.draw(action.data, Client.ctx, {
				save: true,
				only: {
					id: Client.id,
					compOp: action.data.compOp,
				},
			});
			break;
		}
		case PastActionType.RECT: {
			RectTool.draw(action.data, Client.ctx, {
				save: true,
				only: {
					id: Client.id,
					compOp: action.data.compOp,
				},
			});
			break;
		}
		case PastActionType.ELLIPSE: {
			EllipseTool.draw(action.data, Client.ctx, {
				save: true,
				only: {
					id: Client.id,
					compOp: action.data.compOp,
				},
			});
			break;
		}
	}
}

export function doAllActions(): void {
	// Save scroll amount because the table will be deleted
	const rightBoxContent: HTMLElement = document.getElementById("rightBoxContent");
	const tempScrollTop: number = rightBoxContent.scrollTop;

	[...table.children[0].children].forEach((el) => {
		el.remove();
	});

	Canvas.init();
	// Add all actions to the action history table
	for (const action of actions) {
		doAction(action);
		addActionToTable(action.type, action.enabled, false);
	}

	// Restore scroll
	rightBoxContent.scrollTop = tempScrollTop;

	// Undo the redone actions (only done to get canvas images for history)
	Canvas.init();
	for (let i: number = 0; i <= pos; i++)
		doAction(actions[i]);
	updateLastAction();
	enableAvailableButtons();
	Session.drawCurrentActions();
}

// Action history table
let table: HTMLTableElement = document.getElementById("historyTabBox") as HTMLTableElement;

function addActionToTable(type: PastActionType, enabled: boolean = true, updateLast: boolean = true): void {
	let num: number = table.children[0].children.length - 1;

	// Add button to previous action to move down
	const prevRow: HTMLTableRowElement = table.children[0].children[num] as HTMLTableRowElement;
	if (prevRow) {
		if (prevRow.getElementsByClassName("actionMoveDown").length < 1) {
			const cells: HTMLCollectionOf<HTMLTableCellElement> = prevRow.getElementsByClassName("actionButtons") as HTMLCollectionOf<HTMLTableCellElement>;
			if (cells.length > 0) {
				cells[1].appendChild(makeButton(
					Images.DOWN,
					"actionMoveDown",
					() => moveAction(num, +1),
					"Move this action down",
				));
			}
		}
	}

	let editable: boolean = true;
	// Show a user-friendly action name
	let name: string;
	switch (type) {
		case PastActionType.BASE: {
			name = "[ Base Image ]";
			editable = false;
			break;
		}
		case PastActionType.STROKE: {
			name = "Pen";
			break;
		}
		case PastActionType.FILL: {
			name = "Flood fill";
			break;
		}
		case PastActionType.LINE: {
			name = "Line";
			break;
		}
		case PastActionType.RECT: {
			name = "Rectangle";
			break;
		}
		case PastActionType.ELLIPSE: {
			name = "Ellipse";
			break;
		}
		case PastActionType.SELECTION_PASTE: {
			name = "Paste selection";
			break;
		}
		case PastActionType.SELECTION_CLEAR: {
			name = "Clear selection";
			break;
		}
		case PastActionType.CLEAR_BLANK: {
			name = "Clear canvas";
			break;
		}
		case PastActionType.CLEAR: {
			name = "Clear canvas to transparent";
			break;
		}
		case PastActionType.RESIZE_CANVAS: {
			name = "Resize canvas";
			break;
		}
		default: {
			editable = false;
			break;
		}
	}

	const row: HTMLTableRowElement = table.insertRow(-1);
	num++;
	row.addEventListener("click", (event) => {
		if ((event.target as HTMLElement).tagName === "IMG")
			return;
		Client.sendMessage({
			type: Message.MOVE_HISTORY,
			num: num,
		});
		moveTo(num);
	});
	const image: HTMLCanvasElement = document.createElement("canvas");
	image.classList.add("actionHistoryImage");
	if (Session.canvas.width > Session.canvas.height) {
		image.width = 60;
		image.height = Session.canvas.height / (Session.canvas.width / 60);
	} else {
		image.height = 45;
		image.width = Session.canvas.width / (Session.canvas.height / 45);
	}
	image.getContext("2d").drawImage(Session.canvas, 0, 0, image.width, image.height);
	const imageCell: HTMLTableCellElement = row.insertCell(-1);
	imageCell.classList.add("actionHistoryImageCell");
	imageCell.appendChild(image);

	const nameCell: HTMLTableCellElement = row.insertCell(-1);
	nameCell.classList.add("actionName");
	nameCell.textContent = name;

	if (!editable) {
		nameCell.colSpan = 3;
	} else {
		const toggleCell: HTMLTableCellElement = row.insertCell(-1);
		toggleCell.classList.add("actionButtons");
		toggleCell.appendChild(makeButton(
			enabled ? Images.VISIBLE : Images.NO_VISIBLE,
			"actionToggle",
			() => toggleAction(num),
			"Toggle this action",
		));

		const moveCell: HTMLTableCellElement = row.insertCell(-1);
		moveCell.classList.add("actionButtons");
		if (num > 1) {
			moveCell.appendChild(makeButton(
				Images.UP,
				"actionMoveUp",
				() => moveAction(num, -1),
				"Move this action up",
			));
		}

		if (num < actions.length - 1) {
			moveCell.appendChild(makeButton(
				Images.DOWN,
				"actionMoveDown",
				() => moveAction(num, +1),
				"Move this action down",
			));
		}
	}

	if (updateLast)
		updateLastAction();
}

function makeButton(img, btnClass: string, clickHandler: () => void, title: string): HTMLImageElement {
	const btn: HTMLImageElement = document.createElement("img");
	btn.title = title;
	btn.src = img;
	btn.addEventListener("click", clickHandler);
	btn.classList.add(btnClass);
	return btn;
}

function updateLastAction(): void {
	[...document.getElementsByClassName("lastAction")].forEach((el) => {
		el.classList.remove("lastAction");
	});
	// children[0] = <tbody>
	table.children[0].children[pos].classList.add("lastAction");
}

export function replaceHistory(newActions: PastAction[]): void {
	actions = newActions;
}

export function setPos(newPos: number): void {
	pos = newPos;
}

export function reset(): void {
	actions = [];
	pos = -1;
	disableUndo();
	disableRedo();
}

const undoBtn: HTMLButtonElement = document.getElementById("undoBtn") as HTMLButtonElement;
const redoBtn: HTMLButtonElement = document.getElementById("redoBtn") as HTMLButtonElement;

// Enable undo/redo buttons
function enableUndo(): void {
	undoBtn.disabled = false;
}

function enableRedo(): void {
	redoBtn.disabled = false;
}

function disableUndo(): void {
	undoBtn.disabled = true;
	// KeyboardEvents do not fire when a disabled button is focused
	undoBtn.blur();
}

function disableRedo(): void {
	redoBtn.disabled = true;
	// KeyboardEvents do not fire when a disabled button is focused
	redoBtn.blur();
}

// Disable undo/redo buttons and clear the actions just in case
function clearUndo(): void {
	pos -= actions.splice(0, pos).length;
	disableUndo();
}

function clearRedo(): void {
	actions.splice(pos + 1, actions.length - (pos + 1));
	disableRedo();

	// Remove redo actions from action history table - they've been erased
	[...table.children[0].children].slice(pos + 1).forEach((el) => {
		el.remove();
	});
}

function enableAvailableButtons(): void {
	if (actions.slice(0, pos).some((action) => action.enabled))
		enableUndo();
	else
		disableUndo();

	if (actions.slice(pos + 1).some((action) => action.enabled))
		enableRedo();
	else
		disableRedo();
}
