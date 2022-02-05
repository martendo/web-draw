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
import {PastActionType} from "./action-history";
import * as Canvas from "./canvas";
import * as Chat from "./chat";
import * as Colour from "./colour";
import * as Modal from "./ui/modal";
import * as Session from "./session";
import {Action, ActionType} from "./session";
import * as Slider from "./ui/slider";
import * as EllipseTool from "./tools/ellipse";
import * as FillTool from "./tools/fill";
import * as LineTool from "./tools/line";
import * as PenTool from "./tools/pen";
import * as RectTool from "./tools/rect";
import * as SelectTool from "./tools/selection";
import {Selection} from "./tools/selection";
import * as Tools from "./tools/tools";

// The URL of the WebSockets server
const WSS_URL: string = "wss://web-draw.herokuapp.com";

// Send mouse movement update to server (if mouse has moved since last update) every X ms.
const MOUSEMOVE_UPDATE_INTERVAL: number = 50;

// WebSocket closure code descriptions
const CLOSE_CODES: Readonly<{}> = {
	1000: "Normal Closure",
	1001: "Going Away",
	1002: "Protocol Error",
	1003: "Unsupported Data",
	1004: "No current meaning",
	1005: "No Status Received",
	1006: "Abnormal Closure",
	1007: "Invalid frame payload data",
	1008: "Policy Violation",
	1009: "Message too big",
	1010: "Missing Extension",
	1011: "Internal Error",
	1012: "Service Restart",
	1013: "Try Again Later",
	1014: "Bad Gateway",
	1015: "TLS Handshake",
};

export let id: string | null = null;
export let socket: WebSocket | null = null;
let gaveUp: boolean = false;

let connectionWait: number;
let tryReconnect: number | null = null;
let reconnectionWait: number | null = null;

let sendMouse: boolean = true;
let mouseInterval: number | null = null;

export let canvas: HTMLCanvasElement | null = null;
export let ctx: CanvasRenderingContext2D | null = null;

// List of ping latency measurements to calculate average
const prevPings: number[] = [];

// Whether mouse has moved or not since last update was sent to server
export const mouseMoved: {moved: boolean, outside: boolean, x: number, y: number} = {
	moved: false,
	outside: false,
	x: 0,
	y: 0,
};
// Cache mousemove event so it may be used outside of a MouseEvent listener
export let cachedMouseEvent: PointerEvent | null = null;

// Send a message to the server
export function sendMessage(data): void {
	if (!socket)
		return;
	const msg: Uint8Array = msgpack.encode(data);
	socket.send(msg);
}

export function cacheMouseEvent(event: PointerEvent): void {
	cachedMouseEvent = event;
}

function sendMouseMove(): void {
	if (!mouseMoved.moved)
		return;

	const outside: boolean = mouseMoved.x < 0 || mouseMoved.x > Session.canvas.width || mouseMoved.y < 0 || mouseMoved.y > Session.canvas.height;
	if (outside && !mouseMoved.outside) {
		// Just went outside
		sendMessage({
			type: Message.MOUSE_MOVE,
			outside: true,
			clientId: id,
		});
		mouseMoved.outside = true;
	} else if (!outside) {
		// Inside
		sendMessage({
			type: Message.MOUSE_MOVE,
			pos: [
				mouseMoved.x,
				mouseMoved.y,
			],
			clientId: id,
		});
		mouseMoved.outside = false;
	}
	// If already outside and still outside, don't do anything

	mouseMoved.moved = false;
}

export function setSendMouse(value: boolean): void {
	sendMessage({
		type: Message.SEND_MOUSE,
		value: value,
	});
	sendMouse = value;
	if (sendMouse) {
		if (mouseInterval == null)
			mouseInterval = window.setInterval(() => sendMouseMove(), MOUSEMOVE_UPDATE_INTERVAL);
	} else {
		clearInterval(mouseInterval);
		mouseInterval = null;
	}
}

export function setReceiveMouse(value: boolean): void {
	sendMessage({
		type: Message.RECEIVE_MOUSE,
		value: value,
	});
	for (const clientId in Session.clients) {
		if (clientId === id)
			continue;
		document.getElementById("cursorIcon-" + clientId).style.display = value ? "block" : "none";
	}
}

export function disconnect(): void {
	// Signal gave up
	gaveUp = true;
	socket = null;
	if (tryReconnect != null)
		clearTimeout(tryReconnect);
	Session.leave();
	Modal.close("disconnectModal");
}

export function init(): void {
	// Create WebSocket
	socket = new WebSocket(WSS_URL);

	// Show error modal on error
	socket.onerror = (event) => {
		Modal.open("errorModal");
		console.error("WebSocket error:", event);
	};
	socket.onopen = () => {
		Modal.close("disconnectModal");
		Modal.close("errorModal");
		document.getElementById("connectionInfo").style.display = "none";
		const wait: HTMLDivElement = document.getElementById("connectionInfoWait") as HTMLDivElement;
		if (wait)
			wait.style.display = "none";
		document.getElementById("menuOptionsContainer").style.display = "block";
		window.clearInterval(connectionWait);

		// If reconnected, try to restore
		if (tryReconnect != null) {
			sendMessage({
				type: Message.RECONNECT,
				client: {
					id: id,
					name: Session.clients[id].name,
				},
				session: {
					id: Session.id,
					password: Session.password,
				},
			});
			return;
		}

		// Tell the server if there is a session ID in the URL
		const result: RegExpExecArray = /^\/s\/(.+)$/.exec(location.pathname);
		if (result) {
			const pass: RegExpExecArray = /[?&]pass=(.+?)(?:&|$)/.exec(location.search);
			sendMessage({
				type: Message.URL_SESSION,
				id: decodeURIComponent(result[1]),
				password: (pass ? decodeURIComponent(pass[1]) : null),
			});
		}
		// Remove session path in case session isn't joined (e.g. wrong password)
		window.history.replaceState({}, "Web Draw", "/");
		// Query string also removed

		// Send mouse movements if mouse has moved
		mouseInterval = window.setInterval(() => sendMouseMove(), MOUSEMOVE_UPDATE_INTERVAL);

		// Send settings
		document.getElementById("sendMouseMovements").dispatchEvent(new Event("input"));
		document.getElementById("receiveMouseMovements").dispatchEvent(new Event("input"));
	};

	// Tell the user when the socket has closed
	socket.onclose = (event) => {
		if (reconnectionWait)
			clearInterval(reconnectionWait);
		if (gaveUp)
			return;
		socket = null;

		const text: HTMLDivElement = document.getElementById("disconnectText") as HTMLDivElement;
		text.innerHTML = `You were disconnected from the server.<br>Code: ${event.code} (${CLOSE_CODES[event.code]})`;
		if (event.reason) text.innerHTML += `<br>Reason: ${event.reason}`;

		const connectionInfo: HTMLDivElement = document.getElementById("connectionInfo") as HTMLDivElement;
		clearInterval(connectionWait);
		connectionInfo.innerHTML = "Disconnected from server. :(<br><br>";
		connectionInfo.className = "connectionInfoDisconnected";
		connectionInfo.style.display = "block";
		const reloadBtn: HTMLButtonElement = document.createElement("button");
		reloadBtn.textContent = "Reload";
		reloadBtn.addEventListener("click", () => location.reload());
		connectionInfo.appendChild(reloadBtn);
		const downloadBtn: HTMLButtonElement = document.createElement("button");
		downloadBtn.textContent = "Download Canvas";
		downloadBtn.addEventListener("click", () => Canvas.saveFile());
		connectionInfo.appendChild(downloadBtn);
		document.getElementById("menuOptionsContainer").style.display = "none";

		reconnectionWait = window.setInterval(() => {
			const wait: HTMLDivElement = document.getElementById("reconnectWait") as HTMLDivElement;
			if (wait.textContent.length === 3)
				wait.textContent = "";
			wait.innerHTML += ".";
		}, 500);

		Modal.open("disconnectModal");
		tryReconnect = window.setTimeout(() => init(), 500);
	};

	// Handle messages from the server
	socket.onmessage = (event: MessageEvent) => {
		const reader: FileReader = new FileReader();
		reader.onerror = () => {
			console.error(`Error reading WebSockets data:`, event.data);
		};
		reader.onload = () => {
			handleMessage(new Uint8Array(reader.result as ArrayBuffer));
		};
		reader.readAsArrayBuffer(event.data);
	};

	// Animation while waiting to connect to server
	connectionWait = window.setInterval(() => {
		const wait: HTMLDivElement = document.getElementById("connectionInfoWait") as HTMLDivElement;
		if (wait.textContent.length === 3)
			wait.textContent = "";
		wait.innerHTML += "&#183;";
	}, 500);
}

function handleMessage(msg: Uint8Array): void {
	const data: any = msgpack.decode(msg);
	switch (data.type) {
		// Connection to server established (and acknowledged) - set up client ID
		case Message.CONNECTED:
			id = data.id;
			document.getElementById("clientIdInfo").textContent = id;
			document.getElementById("userName").textContent = id;
			break;
		case Message.LATENCY:
			document.getElementById("pingInfo").textContent = `${data.latency} ms`;
			prevPings.push(data.latency);
			let total: number = 0;
			for (let i: number = 0; i < prevPings.length; i++)
				total += prevPings[i];
			const average: string = `${parseFloat((total / prevPings.length).toFixed(1))} ms`;
			document.getElementById("avgPingInfo").textContent = average;

			document.getElementById("minLatency").textContent = `${Math.min(...prevPings)} ms`;
			document.getElementById("maxLatency").textContent = `${Math.max(...prevPings)} ms`;
			document.getElementById("avgLatency").textContent = average;

			const pingTable: HTMLTableSectionElement = document.getElementById("pingTableBody") as HTMLTableSectionElement;
			const row: HTMLTableRowElement = pingTable.insertRow(-1);
			const numCell: HTMLTableCellElement = row.insertCell(-1);
			const latencyCell: HTMLTableCellElement = row.insertCell(-1);
			numCell.textContent = prevPings.length.toString();
			latencyCell.textContent = `${data.latency} ms`;

			break;
		// Another user has started a stroke
		case Message.START_STROKE:
			Session.startClientAction(data.clientId, data.action);
			break;
		// Another user has added a point in their current stroke
		case Message.ADD_STROKE:
			Session.clients[data.clientId].action.data.points.push([data.pos[0], data.pos[1]]);
			PenTool.drawClientStroke(data.clientId);
			break;
		// Another user has ended their stroke
		case Message.END_STROKE:
			PenTool.commitStroke(
				Session.clients[data.clientId].canvas,
				Session.clients[data.clientId].action.data,
			);
			Session.clients[data.clientId].action.type = null;
			Session.endClientAction(data.clientId);
			break;
		// Another user has undone/redone an action
		case Message.MOVE_HISTORY:
			ActionHistory.moveTo(data.num);
			break;
		// Another user has toggled visibility of an action
		case Message.TOGGLE_ACTION:
			ActionHistory.toggleAction(data.num, false);
			break;
		// Another user has moved an action
		case Message.MOVE_ACTION:
			ActionHistory.moveAction(data.num, data.offset, false);
			break;
		// Another user has used the flood fill tool
		case Message.FILL:
			FillTool.fill(data.fill);
			break;
		// Another user has cleared the canvas
		case Message.CLEAR:
			Canvas.clear(false);
			ActionHistory.append(PastActionType.CLEAR);
			break;
		case Message.CLEAR_BLANK:
			Canvas.clearBlank(false);
			ActionHistory.append(PastActionType.CLEAR_BLANK);
			break;
		// Another user has imported an image onto the canvas
		case Message.IMPORT_IMAGE:
			SelectTool.importImage(data.image, data.clientId);
			break;
		case Message.SELECTION_CREATE:
			Session.startClientAction(data.clientId, new Action({
				type: ActionType.SELECTING,
				data: data.selection,
			}));
			break;
		case Message.SELECTION_REMOVE:
			Session.clients[data.clientId].action = {...Action.NULL};
			Session.endClientAction(data.clientId);
			Canvas.update();
			break;
		// Another user has changed their selection
		case Message.SELECTION_UPDATE:
			const sel: Selection = Session.clients[data.clientId].action.data;
			sel.selected = data.selection.selected;
			sel.x = data.selection.x;
			sel.y = data.selection.y;
			sel.width = data.selection.width;
			sel.height = data.selection.height;
			sel.flipped = data.selection.flipped;
			SelectTool.draw(Session.clients[data.clientId].ctx, sel, false, false);
			break;
		case Message.SELECTION_COPY:
			SelectTool.copy(Session.clients[data.clientId].ctx, Session.clients[data.clientId].action.data);
			break;
		case Message.SELECTION_CUT:
			SelectTool.cut(Session.clients[data.clientId].ctx, Session.clients[data.clientId].action.data, data.colour);
			break;
		case Message.SELECTION_PASTE:
			SelectTool.paste(Session.clients[data.clientId].action.data);
			break;
		case Message.SELECTION_CLEAR:
			SelectTool.clear(Session.clients[data.clientId].action.data, data.colour);
			break;
		case Message.LINE:
			Session.startClientAction(data.clientId, new Action({
				type: ActionType.LINE,
				data: data.line,
			}));
			LineTool.draw(data.line, Session.clients[data.clientId].ctx);
			break;
		case Message.COMMIT_LINE:
			LineTool.draw(data.line, Session.clients[data.clientId].ctx, {save: true});
			ActionHistory.append(PastActionType.LINE, data.line);
			Session.endClientAction(data.clientId);
			break;
		case Message.RECT:
			Session.startClientAction(data.clientId, new Action({
				type: ActionType.RECT,
				data: data.rect,
			}));
			RectTool.draw(data.rect, Session.clients[data.clientId].ctx);
			break;
		case Message.COMMIT_RECT:
			RectTool.draw(data.rect, Session.clients[data.clientId].ctx, {save: true});
			ActionHistory.append(PastActionType.RECT, data.rect);
			Session.endClientAction(data.clientId);
			break;
		case Message.ELLIPSE:
			Session.startClientAction(data.clientId, new Action({
				type: ActionType.ELLIPSE,
				data: data.ellipse,
			}));
			EllipseTool.draw(data.ellipse, Session.clients[data.clientId].ctx);
			break;
		case Message.COMMIT_ELLIPSE:
			EllipseTool.draw(data.ellipse, Session.clients[data.clientId].ctx, {save: true});
			ActionHistory.append(PastActionType.ELLIPSE, data.ellipse);
			Session.endClientAction(data.clientId);
			break;
		case Message.USER_NAME:
			Session.clients[data.clientId].name = data.name;
			if (data.clientId === id)
				document.getElementById("userName").textContent = data.name || id;
			[...document.getElementsByClassName("chatMessageName-" + data.clientId)].forEach((name) => name.textContent = data.name || data.clientId);
			[...document.getElementsByClassName("chatPrivateText-" + data.clientId)].forEach((text: HTMLSpanElement) => {
				Chat.writePrivateTextTitle(text, [...text.className.matchAll(/chatPrivateText-([a-z\d]{4})/g)].map((name: RegExpMatchArray) => name[1]));
			});
			Session.updateClientTable();
			break;
		case Message.CHAT_MESSAGE:
			Chat.addMessage(data);
			break;
		// Another user has changed the canvas size
		case Message.RESIZE_CANVAS:
			Canvas.resize(data.options);
			break;
		// The server needs a copy of the canvas to send to a new user
		case Message.REQUEST_CANVAS:
			sendMessage({
				type: Message.RESPONSE_CANVAS,
				data: [
					ActionHistory.actions,
					ActionHistory.pos,
					[
						Object.fromEntries(Object.keys(Session.clients).filter((id) => id !== data.clientId).map((id) => [id, Session.clients[id].action])),
						Session.actionOrder,
					],
				],
				clientId: data.clientId,
			});
			break;
		// The server has received a copy of the canvas from the first user
		case Message.RESPONSE_CANVAS:
			Canvas.setup(data.data);
			break;
		// Another user has opened a canvas file
		case Message.OPEN_CANVAS:
			Canvas.setup(msgpack.decode([0x92, ...data.file]));
			break;
		// A new user has joined the session
		case Message.USER_JOINED:
			Session.addUsers([data.client], data.total);
			break;
		// A user has left the session
		case Message.USER_LEFT:
			Session.removeUsers([data.client], data.total);
			break;
		// Another user has moved their mouse
		case Message.MOUSE_MOVE:
			const cursor: HTMLImageElement = document.getElementById("cursorIcon-" + data.clientId) as HTMLImageElement;
			if (data.outside) {
				cursor.style.display = "none";
			} else {
				const x: number = (data.pos[0] * Canvas.zoom) + (Canvas.displayCanvas.offsetLeft - Canvas.pan.x);
				const y: number = (data.pos[1] * Canvas.zoom) + (Canvas.displayCanvas.offsetTop - Canvas.pan.y);
				cursor.style.left = x + "px";
				cursor.style.top = y + "px";
				cursor.style.display = "block";
			}
			break;
		case Message.DISPLAY_CURSOR:
			document.getElementById("cursorIcon-" + data.clientId).style.display = data.value ? "block" : "none";
			break;
		case Message.PASSWORD_SET:
			if (data.clientId === id)
				Modal.close("setSessionPasswordModal");
			Session.updatePassword(data.password);
			break;
		case Message.ENTER_PASSWORD:
			document.getElementById("enterSessionPasswordId").textContent = data.id;
			Modal.open("enterSessionPasswordModal");
			break;
		case Message.WRONG_PASSWORD:
			document.getElementById("sessionWrongPassword").textContent = data.password;
			document.getElementById("sessionWrongPasswordId").textContent = data.id;
			Modal.open("sessionWrongPasswordModal");
			break;
		// User has joined the session successfully
		case Message.SESSION_JOINED:
			Modal.close("enterSessionPasswordModal");

			document.getElementById("drawScreen").style.display = "grid";
			document.getElementById("menuScreen").style.display = "none";
			if (data.total !== 1)
				Modal.open("retrieveModal");
			Session.updateId(data.id);
			Session.updatePassword(data.password);

			Session.removeUsers(Object.values(Session.clients), 0);
			Session.addUsers(data.clients, data.total);
			canvas = Session.clients[id].canvas;
			ctx = Session.clients[id].ctx;

			if (data.restore)
				break;

			ActionHistory.reset();

			Slider.init();

			Colour.change(0, Colour.DEFAULTS[0], false);
			Colour.change(1, Colour.DEFAULTS[1], false);

			document.getElementById("cursorPos").textContent = "0, 0";

			// Set up quick colour select colours
			const quickColourSelect: HTMLTableElement = document.getElementById("quickColourSelect") as HTMLTableElement;
			const children = quickColourSelect.children;
			for (let i: number = children.length - 1; i >= 0; i--)
				children[i].remove();
			Colour.BASICS.values.forEach((row: readonly string[], rowNum: number) => {
				const quickColourRow: HTMLTableRowElement = document.createElement("tr");
				quickColourRow.classList.add("quickColourRow");
				row.forEach((col: string, colNum: number) => {
					const colour: HTMLTableCellElement = document.createElement("td");
					colour.classList.add("quickColour");
					colour.style.backgroundColor = col;
					colour.title = `${Colour.BASICS.names[rowNum][colNum]}\nLeft or right click to set colour`;
					colour.addEventListener("click", (event) => Colour.setClicked(event, col));
					colour.addEventListener("contextmenu", (event) => Colour.setClicked(event, col));
					quickColourRow.appendChild(colour);
				});
				quickColourSelect.appendChild(quickColourRow);
			});
			const customColourRow: HTMLTableRowElement = document.createElement("tr");
			customColourRow.classList.add("quickColourRow");
			customColourRow.id = "customColourRow";
			for (let i: number = 0; i < Colour.BASICS.values[0].length; i++) {
				const customColour: HTMLTableCellElement = document.createElement("td");
				customColour.classList.add("quickColour", "customColour");
				customColourRow.appendChild(customColour);
			}
			quickColourSelect.appendChild(customColourRow);

			Chat.chatInput.value = "";
			Chat.chatBox.classList.remove("displayNone");
			Chat.updateChatInputHeight();
			Chat.chatBox.classList.add("displayNone");

			Canvas.init();
			ActionHistory.append(PastActionType.BASE);

			// Resize if too big
			Canvas.setZoom(Canvas.DEFAULT_ZOOM);
			Canvas.zoomToWindow("fit", false);

			// Select pen tool
			Tools.switchTool("pen");

			break;
		// The session the user has tried to join does not exist
		case Message.SESSION_NO_EXIST:
			Modal.close("enterSessionPasswordModal");
			document.getElementById("sessionNoExist").textContent = data.id;
			Modal.open("sessionNoExistModal");
			break;
		// The session the user has tried to create already exists
		case Message.SESSION_ALREADY_EXIST:
			document.getElementById("sessionAlreadyExist").textContent = data.id;
			Modal.open("sessionAlreadyExistModal");
			break;
		case Message.SESSION_ID_CHANGED:
			Session.updateId(data.id);
			if (data.clientId === id) {
				Modal.close("changeSessionIdModal");
				document.getElementById("sessionIdChanged").textContent = data.id;
				Modal.open("sessionIdChangedModal");
			}
			break;
		case Message.SESSION_HAS_ID:
			document.getElementById("sessionHasId").textContent = data.id;
			Modal.open("sessionHasIdModal");
			break;
		// An unknown message has been sent from the server. This should never happen!!!
		default:
			console.error("Unknown message!", data);
			return;
	}
}
