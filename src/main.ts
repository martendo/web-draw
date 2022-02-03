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
import {ColourRect} from "./canvas";
import * as Chat from "./chat";
import * as Client from "./client";
import * as Colour from "./colour";
import * as Modal from "./ui/modal";
import * as Session from "./session";
import {Action} from "./session";
import {Stroke} from "./tools/pen";
import {Line} from "./tools/line";
import {Fill} from "./tools/fill";
import {Shape, ShapeColours} from "./tools/shape";
import * as SelectTool from "./tools/selection";
import {Selection, SelectionResize, SelectionPaste, OldSelection, ShortSelection} from "./tools/selection";
import * as Tools from "./tools/tools";
import {Vector2, copyText, setTheme, minmax} from "./helpers";

// msgpack-lite does not define an ImageData Ext type (type 0x00 unused)
msgpack.codec.preset.addExtPacker(0x00, ImageData, (imageData: ImageData): Uint8Array => {
	return msgpack.encode([
		imageData.data,
		imageData.width,
		imageData.height,
	]).slice(1);
});
msgpack.codec.preset.addExtUnpacker(0x00, (buffer: Uint8Array): ImageData => {
	const properties: [Uint8ClampedArray, number, number] = msgpack.decode([0x93, ...new Uint8Array(buffer)]);
	return new ImageData(properties[0], properties[1], properties[2]);
});

// Each MessagePack type object needs a constructor, packer, and unpacker
interface TypeObject<Type> {
	new(...args: any[]): Type;
	packer(object: Type): Uint8Array;
	unpacker(buffer: Uint8Array): Type;
}
// MessagePack Ext format type; msgpack-lite already defines some of 0x00-0x1F
let type: number = 0x20;
function addExt<Type>(typeObject: TypeObject<Type>): void {
	msgpack.codec.preset.addExtPacker<Type>(type, typeObject, (object: Type) => typeObject.packer(object));
	msgpack.codec.preset.addExtUnpacker<Type>(type, (buffer: Uint8Array) => typeObject.unpacker(buffer));
	type++;
}
addExt<Vector2<any>>(Vector2);
addExt<PastAction>(PastAction);
addExt<Action>(Action);
addExt<Stroke>(Stroke);
addExt<Fill>(Fill);
addExt<Selection>(Selection);
addExt<SelectionResize>(SelectionResize);
addExt<SelectionPaste>(SelectionPaste);
addExt<OldSelection>(OldSelection);
addExt<ShortSelection>(ShortSelection);
addExt<Line>(Line);
addExt<Shape>(Shape);
addExt<ShapeColours>(ShapeColours);
addExt<ColourRect>(ColourRect);

// Tell the user if their browser does not support WebSockets
if (!("WebSocket" in window))
	Modal.open("noWsModal");

Client.init();

Tools.initToolSettings();
Tools.loadToolSettings(Tools.currentTool);

// Set up events that end or cancel actions for all of the page in case it happens outside of the canvas
document.addEventListener("pointermove", (event) => Tools.mouseMove(event), {passive: false});
document.addEventListener("pointerup", (event) => Tools.clearMouseHold(event), {passive: false});
document.addEventListener("pointercancel", (event) => Tools.clearMouseHold(event), {passive: false});
document.addEventListener("pointerleave", (event) => Tools.clearMouseHold(event), {passive: false});
document.addEventListener("contextmenu", (event) => {
	if (event.target instanceof Element) {
		const tagName: string = event.target.tagName;
		if (tagName === "A" || tagName === "INPUT" || tagName === "TEXTAREA")
			return;
	}
	event.preventDefault();
	event.stopPropagation();
});
document.addEventListener("click", (event) => {
	if (event.target instanceof Element && event.target.tagName === "LI")
		return;
	const selected: HTMLCollectionOf<HTMLLIElement> = document.getElementsByClassName("menuSelected") as HTMLCollectionOf<HTMLLIElement>;
	for (let i: number = 0; i < selected.length; i++)
		selected[i].classList.remove("menuSelected");
});

window.addEventListener("resize", () => Canvas.updateCanvasAreaSize());

Canvas.displayCanvas.addEventListener("pointermove", (event) => {
	Client.cacheMouseEvent(event);
});

document.addEventListener("keydown", (event) => {
	// Keyboard shortcuts that can only be used when not currently typing or on the canvas
	const tagName: string | null = event.target instanceof Element ? event.target.tagName : null;
	const typing: boolean = event.target instanceof HTMLElement ? event.target.isContentEditable : false;

	notTyping:
	if (tagName !== "INPUT" && tagName !== "TEXTAREA" && !typing && Modal.index === 100) {
		if (!event.ctrlKey) {
			switch (event.key) {
				case "1": {
					Canvas.setZoom(1, true);
					break;
				}
				case "2": {
					Canvas.setZoom(2, true);
					break;
				}
				case "3": {
					Canvas.setZoom(4, true);
					break;
				}
				case "4": {
					Canvas.setZoom(8, true);
					break;
				}
				case "5": {
					Canvas.setZoom(16, true);
					break;
				}
				case "=": {
					Canvas.changeZoom(0.1);
					break;
				}
				case "-": {
					Canvas.changeZoom(-0.1);
					break;
				}
				default: {
					break notTyping;
				}
			}
			event.preventDefault();
			return;
		} else {
			switch (event.key) {
				case "z": {
					ActionHistory.moveWithOffset(-1);
					break;
				}
				case "Z":
				case "y": {
					ActionHistory.moveWithOffset(+1);
					break;
				}
				case "c": {
					if (Tools.currentTool !== "select")
						break notTyping;
					SelectTool.doCopy();
					break;
				}
				case "x": {
					if (Tools.currentTool !== "select")
						break notTyping;
					SelectTool.doCut();
					break;
				}
				case "v": {
					if (Tools.currentTool !== "select")
						break notTyping;
					SelectTool.doPaste();
					break;
				}
				default: {
					break notTyping;
				}
			}
			event.preventDefault();
			return;
		}
	}
	// Keyboard shortcuts that can be used anywhere
	if (!event.ctrlKey) {
		switch (event.key) {
			case "F1": {
				Modal.open("helpModal");
				break;
			}
			case "Escape": {
				Chat.toggle();
				break;
			}
			default: {
				return;
			}
		}
		event.preventDefault();
	}
});

// Set up events for the canvas, but not the move or ending ones (see above event listeners)
Canvas.displayCanvas.addEventListener("pointerdown", (event) => Tools.mouseHold(event));
Canvas.displayCanvas.addEventListener("wheel", (event) => {
	event.preventDefault();
	if (!event.ctrlKey) {
		// Scroll
		const delta: number = Math.sign(event.deltaY) * 75;
		if (event.shiftKey)
			Canvas.pan.x += delta;
		else
			Canvas.pan.y += delta;
		Canvas.drawCanvas();
	} else {
		// Zoom
		const delta: number = Math.sign(event.deltaY) * -0.25;
		Canvas.changeZoom(delta);
	}
});

// Set up inputs
document.getElementById("createSessionBtn").addEventListener("click", () => Session.create());
document.getElementById("joinSessionBtn").addEventListener("click", () => Session.join());

const colourPicker: HTMLInputElement = document.getElementById("colourPicker") as HTMLInputElement;
colourPicker.addEventListener("input", (event: InputEvent) => Colour.update(null, colourPicker.value));
colourPicker.addEventListener("change", (event: Event) => Colour.change(null, colourPicker.value));

const quickColourSelect: HTMLTableElement = document.getElementById("quickColourSelect") as HTMLTableElement;
quickColourSelect.addEventListener("click", (event) => event.preventDefault());
quickColourSelect.addEventListener("contextmenu", (event) => event.preventDefault());

document.getElementById("chooseImage").addEventListener("change", (event) => Canvas.importImage(event));
document.getElementById("chooseCanvasFile").addEventListener("change", (event) => Canvas.openFile(event));

const penColourBoxes: HTMLCollectionOf<HTMLSpanElement> = document.getElementsByClassName("penColour") as HTMLCollectionOf<HTMLSpanElement>;
for (let i: number = 0; i < penColourBoxes.length; i++) {
	const penColourBox: HTMLSpanElement = penColourBoxes[i];
	penColourBox.addEventListener("click", () => Colour.openPicker(i as 0 | 1));
	penColourBox.addEventListener("contextmenu", () => Colour.openPicker(i as 0 | 1));
}
const penColourValues: HTMLCollectionOf<HTMLInputElement> = document.getElementsByClassName("penColourValue") as HTMLCollectionOf<HTMLInputElement>;
for (let i: number = 0; i < penColourValues.length; i++) {
	penColourValues[i].addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Enter")
			Colour.changeWithValue(i as 0 | 1, event);
	});
}
for (const toolName of Tools.NAMES)
	document.getElementById(toolName + "Btn").addEventListener("click", () => Tools.switchTool(toolName));

const menuLabels: HTMLCollectionOf<HTMLDivElement> = document.getElementsByClassName("menuLabel") as HTMLCollectionOf<HTMLDivElement>;
for (let i: number = 0; i < menuLabels.length; i++) {
	const menuLabel: HTMLDivElement = menuLabels[i];
	if (menuLabel.parentElement.getElementsByClassName("menuDropdown").length > 0) {
		menuLabel.addEventListener("click", () => {
			const selected: HTMLCollectionOf<HTMLLIElement> = document.getElementsByClassName("menuSelected") as HTMLCollectionOf<HTMLLIElement>;
			for (let i: number = 0; i < selected.length; i++) {
				if (selected[i] !== menuLabel.parentElement)
					selected[i].classList.remove("menuSelected");
			}
			menuLabel.parentElement.classList.toggle("menuSelected");
			event.stopPropagation();
		});
	}
}
document.getElementById("fileSaveBtn").addEventListener("click", () => Canvas.saveFile());
document.getElementById("fileOpenBtn").addEventListener("click", () => document.getElementById("chooseCanvasFile").click());
document.getElementById("fileExportBtn").addEventListener("click", () => Canvas.exportImage());
document.getElementById("fileImportBtn").addEventListener("click", () => document.getElementById("chooseImage").click());
document.getElementById("editUndoBtn").addEventListener("click", () => ActionHistory.moveWithOffset(-1));
document.getElementById("editRedoBtn").addEventListener("click", () => ActionHistory.moveWithOffset(+1));
document.getElementById("editClearBtn").addEventListener("click", () => Canvas.clearBlank());
document.getElementById("editClearTransparentBtn").addEventListener("click", () => Canvas.clear());
document.getElementById("editSettingsBtn").addEventListener("click", () => Modal.open("settingsModal"));
document.getElementById("viewResetZoomBtn").addEventListener("click", () => Canvas.setZoom(Canvas.DEFAULT_ZOOM));
document.getElementById("viewFitZoomBtn").addEventListener("click", () => Canvas.zoomToWindow("fit"));
document.getElementById("viewFillZoomBtn").addEventListener("click", () => Canvas.zoomToWindow("fill"));
document.getElementById("sessionInfoBtn").addEventListener("click", () => Modal.open("sessionInfoModal"));
document.getElementById("sessionChangeIdBtn").addEventListener("click", () => {
	(document.getElementById("sessionIdNew") as HTMLInputElement).value = Session.id;
	Modal.open("changeSessionIdModal");
});
document.getElementById("sessionSetPasswordBtn").addEventListener("click", () => Modal.open("setSessionPasswordModal"));
document.getElementById("sessionShareLinkBtn").addEventListener("click", () => Modal.open("shareSessionLinkModal"));
document.getElementById("sessionLeaveBtn").addEventListener("click", () => Session.leave());
document.getElementById("helpHelpBtn").addEventListener("click", () => Modal.open("helpModal"));
document.getElementById("helpInfoBtn").addEventListener("click", () => Modal.open("infoModal"));
document.getElementById("helpBtn").addEventListener("click", () => Modal.open("helpModal"));
document.getElementById("infoBtn").addEventListener("click", () => Modal.open("infoModal"));
document.getElementById("userBtn").addEventListener("click", () => {
	(document.getElementById("userNameInput") as HTMLInputElement).value = Session.clients[Client.id].name || "";
	Modal.open("userModal");
});
document.getElementById("chatBtn").addEventListener("click", () => Chat.toggle());
document.getElementById("chatXBtn").addEventListener("click", () => Chat.close());

const tabs: HTMLTableCellElement[] = [...(document.getElementsByClassName("tab") as HTMLCollectionOf<HTMLTableCellElement>)];
tabs.forEach((tab) => {
	tab.addEventListener("click", () => {
		tabs.forEach((t) => {
			t.classList.remove("tabSelected");
			document.getElementById(t.id + "Box").style.display = "none";
		});
		tab.classList.add("tabSelected");
		document.getElementById(tab.id + "Box").style.display = "table";
	});
});
document.getElementById("toolTab").dispatchEvent(new Event("click"));

Chat.chatInput.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		Chat.send();
		event.preventDefault();
	}
});
Chat.chatInput.addEventListener("input", () => {
	const box: HTMLDivElement = document.getElementById("chatMessages") as HTMLDivElement;
	const isAtBottom: boolean = box.scrollTop === box.scrollHeight - box.clientHeight;
	Chat.updateChatInputHeight();
	if (isAtBottom)
		box.scrollTop = box.scrollHeight - box.clientHeight;
});
document.getElementById("chatSendBtn").addEventListener("click", () => Chat.send());

document.getElementById("undoBtn").addEventListener("click", () => ActionHistory.moveWithOffset(-1));
document.getElementById("redoBtn").addEventListener("click", () => ActionHistory.moveWithOffset(+1));
const clearBtn: HTMLButtonElement = document.getElementById("clearBtn") as HTMLButtonElement;
clearBtn.addEventListener("click", () => Canvas.clearBlank());
clearBtn.addEventListener("dblclick", () => Canvas.clear());
document.getElementById("resetZoomBtn").addEventListener("click", () => Canvas.setZoom(Canvas.DEFAULT_ZOOM));
document.getElementById("fitZoomBtn").addEventListener("click", () => Canvas.zoomToWindow("fit"));

document.getElementById("shareLinkBtn").addEventListener("click", () => Modal.open("shareSessionLinkModal"));
document.getElementById("leaveBtn").addEventListener("click", () => Session.leave());

[...document.getElementsByClassName("clickToCopy")].forEach((el) => {
	el.addEventListener("click", (event) => copyText(el.textContent, event));
});
document.getElementById("allPingsLink").addEventListener("click", () => Modal.open("allPingsModal"));

document.getElementById("allPingsModalDoneBtn").addEventListener("click", () => Modal.close("allPingsModal"));

const resizeWidth: HTMLInputElement = document.getElementById("canvasResizeWidth") as HTMLInputElement;
const resizeHeight: HTMLInputElement = document.getElementById("canvasResizeHeight") as HTMLInputElement;
const offsetX: HTMLInputElement = document.getElementById("canvasResizeOffsetX") as HTMLInputElement;
const offsetY: HTMLInputElement = document.getElementById("canvasResizeOffsetY") as HTMLInputElement;
document.getElementById("editResizeBtn").addEventListener("click", () => {
	resizeWidth.value = Session.canvas.width.toString();
	resizeHeight.value = Session.canvas.height.toString();
	offsetX.min = "0";
	offsetX.max = "0";
	offsetX.value = "0";
	offsetY.min = "0";
	offsetY.max = "0";
	offsetY.value = "0";
	updateResizePreview();
	Modal.open("canvasResizeModal");
});
resizeWidth.addEventListener("input", () => {
	const delta: number = parseInt(resizeWidth.value, 10) - Session.canvas.width;
	offsetX.min = Math.min(delta, 0).toString();
	offsetX.max = Math.max(delta, 0).toString();
	offsetX.value = minmax(parseInt(offsetX.value, 10), parseInt(offsetX.min, 10), parseInt(offsetX.max, 10)).toString();
});
resizeHeight.addEventListener("input", () => {
	const delta: number = parseInt(resizeHeight.value, 10) - Session.canvas.height;
	offsetY.min = Math.min(delta, 0).toString();
	offsetY.max = Math.max(delta, 0).toString();
	offsetY.value = minmax(parseInt(offsetY.value, 10), parseInt(offsetY.min, 10), parseInt(offsetY.max, 10)).toString();
});
document.getElementById("canvasResizeOffsetCentre").addEventListener("click", () => {
	offsetX.value = Math.round((parseInt(resizeWidth.value, 10) - Session.canvas.width) / 2).toString();
	offsetY.value = Math.round((parseInt(resizeHeight.value, 10) - Session.canvas.height) / 2).toString();
	updateResizePreview();
});

const resizeFill: HTMLSelectElement = document.getElementById("canvasResizeFill") as HTMLSelectElement;
resizeFill.value = "1";
function getResizeFillColour(): string | null {
	switch (parseInt(resizeFill.value, 10)) {
		case 0: {
			return Colour.currents[0];
		}
		case 1: {
			return Colour.currents[1];
		}
		case 2: {
			return "#ffffff";
		}
		// Transparency = null
		case 3:
		default: {
			return null;
		}
	}
}

const previewCanvas: HTMLCanvasElement = document.getElementById("resizePreviewCanvas") as HTMLCanvasElement;
const previewCtx: CanvasRenderingContext2D = previewCanvas.getContext("2d");

function updateResizePreview() {
	const newWidth: number = parseInt(resizeWidth.value, 10);
	const newHeight: number = parseInt(resizeHeight.value, 10);

	const canvasWidth: number = Session.canvas.width;
	const canvasHeight: number = Session.canvas.height;

	const previewWidth: number = Math.max(newWidth, newWidth + (canvasWidth - newWidth) * 2);
	const previewHeight: number = Math.max(newHeight, newHeight + (canvasHeight - newHeight) * 2);
	let divisor: number;
	if (previewWidth > previewHeight) {
		previewCanvas.width = 200;
		divisor = previewWidth / 200;
		previewCanvas.height = previewHeight / divisor;
	} else {
		previewCanvas.height = 200;
		divisor = previewHeight / 200;
		previewCanvas.width = previewWidth / divisor;
	}
	const previewNewWidth: number = Math.round(newWidth / divisor);
	const previewNewHeight: number = Math.round(newHeight / divisor);
	const previewX: number = Math.round((previewCanvas.width / 2) - (previewNewWidth / 2));
	const previewY: number = Math.round((previewCanvas.height / 2) - (previewNewHeight / 2));
	const previewCanvasX: number = Math.round(previewX + (parseInt(offsetX.value, 10) / divisor));
	const previewCanvasY: number = Math.round(previewY + (parseInt(offsetY.value, 10) / divisor));
	const previewCanvasWidth: number = Math.round(canvasWidth / divisor);
	const previewCanvasHeight: number = Math.round(canvasHeight / divisor);

	const bgColour: string | null = getResizeFillColour();
	if (bgColour !== null)
		previewCtx.fillStyle = bgColour;
	else
		previewCtx.fillStyle = Canvas.transparentPattern;
	previewCtx.fillRect(previewX, previewY, previewNewWidth, previewNewHeight);

	previewCtx.fillStyle = Canvas.transparentPattern;
	previewCtx.fillRect(previewCanvasX, previewCanvasY, previewCanvasWidth, previewCanvasHeight);
	previewCtx.drawImage(Session.canvas, previewCanvasX, previewCanvasY, previewCanvasWidth, previewCanvasHeight);

	previewCtx.lineWidth = 1;
	previewCtx.strokeStyle = "#000000";
	previewCtx.globalAlpha = 0.5;
	previewCtx.strokeRect(previewX - 0.5, previewY - 0.5, previewNewWidth + 1, previewNewHeight + 1);
	previewCtx.globalAlpha = 0.25;
	previewCtx.strokeRect(previewCanvasX - 0.5, previewCanvasY - 0.5, previewCanvasWidth + 1, previewCanvasHeight + 1);
	previewCtx.globalAlpha = 1;
}

[resizeWidth, resizeHeight, offsetX, offsetY, resizeFill].forEach((input) => {
	input.addEventListener("input", () => updateResizePreview());
});

document.getElementById("resizeModalResetBtn").addEventListener("click", () => {
	resizeWidth.value = Session.canvas.width.toString();
	resizeWidth.dispatchEvent(new Event("input"));
	resizeHeight.value = Session.canvas.height.toString();
	resizeHeight.dispatchEvent(new Event("input"));
	resizeFill.value = "1";
});
document.getElementById("resizeModalResizeBtn").addEventListener("click", () => {
	Modal.close("canvasResizeModal");
	const options: ColourRect = new ColourRect({
		width: parseInt(resizeWidth.value, 10),
		height: parseInt(resizeHeight.value, 10),
		x: parseInt(offsetX.value, 10),
		y: parseInt(offsetY.value, 10),
		colour: getResizeFillColour(),
	});
	Client.sendMessage({
		type: Message.RESIZE_CANVAS,
		options: options,
	});
	Canvas.resize(options);
});
document.getElementById("resizeModalCancelBtn").addEventListener("click", () => Modal.close("canvasResizeModal"));

document.getElementById("settingsModalDoneBtn").addEventListener("click", () => Modal.close("settingsModal"));
const sendMouseMovements: HTMLInputElement = document.getElementById("sendMouseMovements") as HTMLInputElement;
sendMouseMovements.addEventListener("input", (event: InputEvent) => Client.setSendMouse(sendMouseMovements.checked));
const receiveMouseMovements: HTMLInputElement = document.getElementById("receiveMouseMovements") as HTMLInputElement;
receiveMouseMovements.addEventListener("input", (event: InputEvent) => Client.setReceiveMouse(receiveMouseMovements.checked));

document.getElementById("lightTheme").addEventListener("change", () => setTheme("light"));
document.getElementById("darkTheme").addEventListener("change", () => setTheme("dark"));
const theme: string = localStorage.getItem("theme");
if (theme) {
	document.documentElement.className = theme;
	(document.getElementById(theme + "Theme") as HTMLInputElement).checked = true;
}

document.getElementById("helpModalDoneBtn").addEventListener("click", () => {
	Modal.close("helpModal");
	location.hash = "";
});
document.getElementById("infoModalDoneBtn").addEventListener("click", () => Modal.close("infoModal"));

document.getElementById("sessionInfoModalDoneBtn").addEventListener("click", () => Modal.close("sessionInfoModal"));

document.getElementById("sessionIdModalChangeBtn").addEventListener("click", () => Session.changeId());
document.getElementById("sessionIdModalCancelBtn").addEventListener("click", () => Modal.close("changeSessionIdModal"));
document.getElementById("sessionIdChangedModalOkBtn").addEventListener("click", () => Modal.close("sessionIdChangedModal"));
document.getElementById("sessionHasIdModalOkBtn").addEventListener("click", () => Modal.close("sessionHasIdModal"));

document.getElementById("setSessionPasswordModalRemoveBtn").addEventListener("click", () => Client.sendMessage({
	type: Message.SESSION_PASSWORD,
	password: null,
}));
document.getElementById("setSessionPasswordModalSetBtn").addEventListener("click", () => Session.setPassword());
document.getElementById("setSessionPasswordModalCancelBtn").addEventListener("click", () => Modal.close("setSessionPasswordModal"));

document.getElementById("shareLinkModalCloseBtn").addEventListener("click", () => Modal.close("shareSessionLinkModal"));
document.getElementById("sessionLinkCopy").addEventListener("click", (event) => copyText(Session.link));
document.getElementById("sessionLinkPasswordInput").addEventListener("input", () => Session.updateLink());

document.getElementById("enterSessionPasswordModalJoinBtn").addEventListener("click", () => Session.enterPassword());
document.getElementById("enterSessionPasswordModalCancelBtn").addEventListener("click", () => Modal.close("enterSessionPasswordModal"));
document.getElementById("sessionWrongPasswordModalOkBtn").addEventListener("click", () => Modal.close("sessionWrongPasswordModal"));

document.getElementById("errorModalOkBtn").addEventListener("click", () => Modal.close("errorModal"));
document.getElementById("oldCanvasFileModalOkBtn").addEventListener("click", () => Modal.close("oldCanvasFileModal"));
document.getElementById("disconnectModalGiveUpBtn").addEventListener("click", () => Client.disconnect());
document.getElementById("sessionNoExistModalOkBtn").addEventListener("click", () => Modal.close("sessionNoExistModal"));
document.getElementById("sessionAlreadyExistModalOkBtn").addEventListener("click", () => Modal.close("sessionAlreadyExistModal"));

document.getElementById("userModalSaveBtn").addEventListener("click", () => Session.saveUserSettings());
document.getElementById("userModalCancelBtn").addEventListener("click", () => Modal.close("userModal"));

document.getElementById("canvasZoom").addEventListener("input", (event: InputEvent) => Canvas.setZoomValue(event));

document.getElementById("selectCopyBtn").addEventListener("click", () => SelectTool.doCopy());
document.getElementById("selectCutBtn").addEventListener("click", () => SelectTool.doCut());
document.getElementById("selectPasteBtn").addEventListener("click", () => SelectTool.doPaste());
document.getElementById("selectClearBtn").addEventListener("click", () => {
	Client.sendMessage({
		type: Message.SELECTION_CLEAR,
		colour: Colour.currents[1],
		clientId: Client.id,
	});
	SelectTool.clear(Session.clients[Client.id].action.data, Colour.currents[1]);
});

window.addEventListener("beforeunload", () => {
	Session.leave();
	Client.socket.close(1000);
});
