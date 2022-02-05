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
import {PastAction} from "./action-history";
import * as Canvas from "./canvas";
import * as Chat from "./chat";
import * as Client from "./client";
import * as Images from "./images";
import * as Modal from "./ui/modal";
import * as EllipseTool from "./tools/ellipse";
import * as LineTool from "./tools/line";
import * as PenTool from "./tools/pen";
import * as RectTool from "./tools/rect";
import * as SelectTool from "./tools/selection";
import {copyText} from "./helpers";

export class Action {
	type: ActionType;
	data: any;

	constructor({type, data}: Action) {
		this.type = type;
		this.data = data;
	}

	static readonly NULL: Readonly<Action> = new Action({
		type: null,
		data: null,
	});

	static packer(action: Action): Uint8Array {
		return msgpack.encode([
			action.type,
			action.data,
		]).slice(1);
	}
	static unpacker(buffer: Uint8Array): Action {
		const properties: [ActionType, any] = msgpack.decode([0x92, ...new Uint8Array(buffer)]);
		return new Action({
			type: properties[0],
			data: properties[1],
		});
	}
}

export const enum ActionType {
	STROKE,
	SELECTING,
	SELECTION_MOVE,
	SELECTION_RESIZE,
	LINE,
	RECT,
	ELLIPSE,
}

export class Member {
	id: string;
	name: string;
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	action: Action;

	constructor({name, canvas, ctx, action}: Member) {
		this.id = id;
		this.name = name;
		this.canvas = canvas;
		this.ctx = ctx;
		this.action = action;
	}
}

export let id: string | null = null;
export let password: string | null = null;
export let link: string = location.origin;

// Session canvas (permanent)
export const canvas: HTMLCanvasElement = document.createElement("canvas");
export const ctx: CanvasRenderingContext2D = canvas.getContext("2d");

export let actionOrder: string[] = [];

export const clients: {[key: string]: Member} = {};

// Add a user canvas and mouse and update the total
export function addUsers(c: Member[], total: number): void {
	c.forEach((client: Member) => {
		if (client.id !== Client.id) {
			const img: HTMLImageElement = document.createElement("img");
			img.src = Images.CURSOR;
			img.classList.add("cursorIcon");
			img.id = "cursorIcon-" + client.id;
			document.body.appendChild(img);
		}
		const clientCanvas: HTMLCanvasElement = document.createElement("canvas");
		clientCanvas.classList.add("clientCanvas");
		clientCanvas.width = canvas.width;
		clientCanvas.height = canvas.height;
		clients[client.id] = new Member({
			id: client.id,
			name: client.name,
			canvas: clientCanvas,
			ctx: clientCanvas.getContext("2d"),
			action: {...Action.NULL},
		});
	});
	updateUserInfo(total);
}

// Remove a user canvas and mouse and update the total
export function removeUsers(c: {id: string, name: string}[], total: number): void {
	c.forEach((client: {id: string, name: string}) => {
		delete clients[client.id];
		endClientAction(client.id);
		const img: HTMLImageElement = document.getElementById("cursorIcon-" + client.id) as HTMLImageElement;
		if (img)
			img.remove();
		Canvas.update();
	});
	updateUserInfo(total);
}

// Update the total number of users connected to the current session
function updateUserInfo(num: number): void {
	let isAre: string = "are";
	let s: string = "s";
	if (num === 1) {
		isAre = "is";
		s = "";
	}
	document.getElementById("userBox").innerHTML = `There ${isAre} <a href="javascript:void(0)" id="userCount">${num} user${s}</a> connected to this session.`;
	document.getElementById("userCount").onclick = () => Modal.open("sessionInfoModal");

	document.getElementById("sessionInfoClients").textContent = num.toString();
	updateClientTable();
}

export function updateClientTable(): void {
	const table: HTMLTableElement = document.getElementById("sessionInfoClientBody") as HTMLTableElement;
	for (let i: number = table.children.length - 1; i >= 0; i--)
		table.removeChild(table.children[i]);
	for (const [clientId, client] of Object.entries(clients)) {
		const row: HTMLTableRowElement = table.insertRow(-1);
		const idCell: HTMLTableCellElement = row.insertCell(0);
		const nameCell: HTMLTableCellElement = row.insertCell(1);
		idCell.textContent = clientId;
		nameCell.textContent = client.name;
		row.classList.add("sessionInfoClient");
		if (clientId === Client.id)
			row.classList.add("sessionInfoThisClient");
		row.title = "Click to send private message";
		row.addEventListener("click", () => {
			Chat.open();
			Chat.addMessageTo(clientId);
			Modal.close("sessionInfoModal");
		});
	}
}

export function setActionOrder(newOrder: string[]): void {
	actionOrder = newOrder;
}

export function startClientAction(clientId: string, action): void {
	clients[clientId].action = action;
	if (!actionOrder.includes(clientId))
		actionOrder.push(clientId);
}

export function endClientAction(clientId: string): void {
	const index: number = actionOrder.indexOf(clientId);
	if (index !== -1)
		actionOrder.splice(index, 1);
}

export function drawCurrentActions(): void {
	for (const [clientId, client] of Object.entries(clients)) {
		const isThisClient: boolean = clientId === Client.id;
		const action: Action = client.action;
		switch (action.type) {
			case ActionType.STROKE: {
				PenTool.drawStroke(client.ctx, action.data);
				break;
			}
			case ActionType.LINE: {
				LineTool.draw(action.data, client.ctx);
				break;
			}
			case ActionType.RECT: {
				RectTool.draw(action.data, client.ctx);
				break;
			}
			case ActionType.ELLIPSE: {
				EllipseTool.draw(action.data, client.ctx);
				break;
			}
			case ActionType.SELECTING: {
				SelectTool.draw(client.ctx, action.data, false, isThisClient);
				break;
			}
			case ActionType.SELECTION_MOVE:
			case ActionType.SELECTION_RESIZE: {
				SelectTool.draw(client.ctx, action.data, isThisClient, isThisClient);
				break;
			}
			case null: {
				// Area is selected but currently not being modified
				if (action.data && action.data.hasOwnProperty("selected"))
					SelectTool.draw(client.ctx, action.data, isThisClient, isThisClient);
				break;
			}
		}
	}
	Canvas.update();
}

// Request to create a new session
export function create(): void {
	Client.sendMessage({
		type: Message.CREATE_SESSION,
		id: (document.getElementById("sessionIdInput") as HTMLInputElement).value,
	});
}

// Request to join a session
export function join(): void {
	Client.sendMessage({
		type: Message.JOIN_SESSION,
		id: (document.getElementById("sessionIdInput") as HTMLInputElement).value,
	});
}

// Leave a session
export function leave(): void {
	Client.sendMessage({
		type: Message.LEAVE_SESSION,
	});

	document.getElementById("menuScreen").style.display = "grid";
	document.getElementById("drawScreen").style.display = "none";
	const cursors: HTMLCollection = document.getElementsByClassName("cursorIcon");
	for (let i: number = 0; i < cursors.length; i++)
		cursors[i].remove();
	const title: string = "Web Draw";
	document.title = title;
	window.history.replaceState({}, title, "/");
	document.getElementById("sessionIdInfo").textContent = "N/A";

	id = null;
}

export function changeId(): void {
	Client.sendMessage({
		type: Message.SESSION_ID,
		id: (document.getElementById("sessionIdNew") as HTMLInputElement).value,
	});
}

export function updateId(newId: string): void {
	id = newId;
	const title: string = `Web Draw – ${id}`;
	document.title = title;
	window.history.replaceState({}, title, `/s/${encodeURIComponent(id)}`);
	document.getElementById("sessionId").textContent = id;
	document.getElementById("sessionIdInfo").textContent = id;
	document.getElementById("sessionIdCurrent").textContent = id;
	document.getElementById("sessionInfoId").textContent = id;
	updateLink();
}

export function updatePassword(newPassword: string | null): void {
	password = newPassword;
	const text: HTMLSpanElement = document.getElementById("sessionPasswordCurrent");
	if (password === null) {
		text.textContent = "There is currently no password set on this session.";
	} else {
		text.innerHTML = `Current password: <span class="clickToCopy lightBox" title="Copy" id="currentPassword">${password}</span>`;
		const current: HTMLSpanElement = document.getElementById("currentPassword");
		current.onclick = (event) => copyText(current.textContent, event);
	}
	updateLink();
}

export function updateLink(): void {
	link = `${location.origin}/s/${encodeURIComponent(id)}`;
	const includePassword: HTMLDivElement = document.getElementById("sessionLinkPassword") as HTMLDivElement;
	const includePasswordInput: HTMLInputElement = document.getElementById("sessionLinkPasswordInput") as HTMLInputElement;
	if (password !== null) {
		if (includePasswordInput.checked)
			link += `?pass=${encodeURIComponent(password)}`;
		includePassword.style.display = "block";
	} else {
		includePassword.style.display = "none";
	}
	document.getElementById("sessionLink").textContent = link;
}

export function setPassword(): void {
	Client.sendMessage({
		type: Message.SESSION_PASSWORD,
		password: (document.getElementById("sessionPasswordNew") as HTMLInputElement).value,
	});
}

export function enterPassword(): void {
	Client.sendMessage({
		type: Message.ENTER_PASSWORD,
		password: (document.getElementById("enterSessionPassword") as HTMLInputElement).value,
		id: document.getElementById("enterSessionPasswordId").textContent,
	});
}

export function saveUserSettings(): void {
	let name: string = (document.getElementById("userNameInput") as HTMLInputElement).value;
	if (name.length < 1)
		name = null;
	if (name !== clients[Client.id].name) {
		Client.sendMessage({
			type: Message.USER_NAME,
			name: name,
			clientId: Client.id,
		});
		document.getElementById("userName").textContent = name;
	}
	Modal.close("userModal");
}
