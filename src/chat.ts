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

import {Message} from "./message";
import * as Canvas from "./canvas";
import * as Client from "./client";
import * as Session from "./session";

const MONTH_NAMES: readonly string[] = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

export const chatBox: HTMLDivElement = document.getElementById("chatBox") as HTMLDivElement;
export const chatInput: HTMLInputElement = document.getElementById("chatInput") as HTMLInputElement;

function format(message: string): string {
	// Replace characters that can interfere with HTML, and do markdown-ish styling
	const noStyle: string[] = [];
	return message
		.replace(/&/g, "&#38;")
		.replace(/</g, "&#60;")
		.replace(/>/g, "&#62;")
		.replace(/"/g, "&#34;")
		.replace(/'/g, "&#39;")
		.replace(/\b(https?:\/\/[a-z0-9\-+&@#\/%?=~_|!:,.;]*[a-z0-9\-+&@#\/%=~_|])\b/ig, (match, p1) => {
			// Save the URL to prevent styling
			noStyle.push(`<a href="${p1}" target="_blank" title="${p1}">${p1}</a>`);
			return `&!${noStyle.length - 1};`;
		})
		.replace(/(^|[^\\])((?:\\{2})*)\*\*([\s\S]*?[^\\](?:\\{2})*)\*\*/mg, "$1$2<strong>$3</strong>") // **bold**
		.replace(/(^|[^\\])((?:\\{2})*)__([\s\S]*?[^\\](?:\\{2})*)__/mg, "$1$2<u>$3</u>") // __underlined__
		.replace(/(^|[^\\])((?:\\{2})*)~~([\s\S]*?[^\\](?:\\{2})*)~~/mg, "$1$2<s>$3</s>") // ~~strikethrough~~
		.replace(/(^|[^\\*_])((?:\\{2})*)[*_]([\s\S]*?[^\\*_](?:\\{2})*)[*_]/mg, "$1$2<em>$3</em>") // *italicized* OR _italicized_
		.replace(/\\([^\sa-z0-9])/img, "$1")
		.replace(/\\/g, "&#92;")
		.replace(/&!(\d+);/g, (match, p1) => {
			return noStyle[parseInt(p1, 10)];
		});
}

export function send(): void {
	const msg: string = chatInput.value;
	// Check whether or not the message would *appear* empty
	const formatted: string = format(msg).replace(/<\w+?>([\s\S]*?)<\/\w+?>/mg, "$1");
	const indexSpace: number = formatted.indexOf(" ");
	// If message appears empty, don't allow sending it
	if (
		formatted.trim() === "" || (
			formatted.slice(0, 3) === "to:" && (
				indexSpace === -1 || formatted.slice(indexSpace).trim() === ""
			)
		)
	) {
		return;
	}

	chatInput.value = "";
	const box: HTMLElement = document.getElementById("chatMessages");
	const isAtBottom: boolean = box.scrollTop === box.scrollHeight - box.clientHeight;
	updateChatInputHeight();
	if (isAtBottom)
		box.scrollTop = box.scrollHeight - box.clientHeight;
	Client.sendMessage({
		type: Message.CHAT_MESSAGE,
		message: msg,
		clientId: Client.id,
	});
}

function getFullDate(date: Date): string {
	let month: string = MONTH_NAMES[date.getMonth()];
	let day: number = date.getDate();
	let year: number = date.getFullYear();
	let hours: number = date.getHours();
	let amPm: string = hours < 12 ? "AM" : "PM";
	let minutes: string = ("0" + date.getMinutes()).substr(-2);
	let seconds: string = ("0" + date.getSeconds()).substr(-2);
	hours %= 12;
	hours = hours ? hours : 12;
	return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds} ${amPm}`;
}

export function addMessageTo(id: string): void {
	if (chatInput.value.slice(0, 3) === "to:") {
		// "to:" at beginning of message, already has list
		const split: string[] = chatInput.value.split(" ");
		// List of IDs already contains ID
		if (split[0].slice(3).split(",").indexOf(id) !== -1)
			return;
		const toLen: number = split[0].length;
		// Add to the existing list: A comma if there is already an ID in it, the new ID, space and the rest of the message
		chatInput.value = chatInput.value.slice(0, toLen) + (toLen === 3 ? "" : ",") + id + " " + (chatInput.value.slice(toLen + 1) || "");
	} else {
		// Message doesn't have a "to:" list yet, add one;
		chatInput.value = `to:${id} ` + (chatInput.value.slice(0, 1) === " " ? chatInput.value.slice(1) : chatInput.value);
	}
	updateChatInputHeight();
	chatInput.focus();
}

export function addMessage(msg): void {
	const box: HTMLDivElement = document.getElementById("chatMessages") as HTMLDivElement;
	let bubble: HTMLDivElement;
	const last: HTMLDivElement = box.children[box.children.length - 1] as HTMLDivElement;
	// Quirk that is actually wanted: When chatBox is not displayed, its dimensions are all 0, so isAtBottom is true
	// 14 = 8px padding, 1px border, 5px margin
	const isAtBottom: boolean = box.scrollHeight - box.clientHeight <= box.scrollTop + (last ? last.children[last.children.length - 1].getBoundingClientRect().height : 0) + 14;
	// Create new message bubble if last message was not from the same person or is not of the same type or it was 3 or more minutes ago
	if (
		!last
		|| parseInt((last.children[last.children.length - 1] as HTMLDivElement).dataset.timestamp, 10) + 1000*60*3 < msg.timestamp
		|| (
			msg.priv ? (
				!last.classList.contains("chatMessage-" + msg.clientId)
				|| !last.classList.contains("chatMessagePrivate-" + msg.priv)
			) : (
				!last.classList.contains("chatMessage-" + msg.clientId)
				|| last.classList.contains("chatMessagePrivate")
			)
		)
	) {
		bubble = document.createElement("div");
		bubble.classList.add("chatMessageBubble", "chatMessage-" + msg.clientId);
		const nameRow: HTMLDivElement = document.createElement("div");
		nameRow.classList.add("chatMessageNameRow");
		const name: HTMLAnchorElement = document.createElement("a");
		name.classList.add("chatMessageName", "chatMessageName-" + msg.clientId);
		name.textContent = Session.clients[msg.clientId].name || msg.clientId;
		name.title = msg.clientId;
		name.href = "javascript:void(0)";
		name.addEventListener("click", () => addMessageTo(msg.clientId));
		nameRow.appendChild(name);
		const time: HTMLSpanElement = document.createElement("span");
		time.classList.add("chatMessageTime");
		const timestamp: Date = new Date(msg.timestamp);
		let hours: number = timestamp.getHours();
		const amPm: string = hours < 12 ? "AM" : "PM";
		hours %= 12;
		hours = hours ? hours : 12;
		time.textContent = `${hours}:${("0" + timestamp.getMinutes()).slice(-2)} ${amPm}`;
		time.title = getFullDate(timestamp);
		nameRow.appendChild(time);
		if (msg.priv) {
			bubble.classList.add("chatMessagePrivate", "chatMessagePrivate-" + msg.priv);
			const privateText: HTMLSpanElement = document.createElement("span");
			privateText.classList.add("chatPrivateText");
			privateText.textContent = "Private";
			writePrivateTextTitle(privateText, msg.priv);
			nameRow.appendChild(privateText);
		}
		bubble.appendChild(nameRow);
	} else {
		// Message is the same type as the last, just add to the bottom of the previous bubble
		const bubbles: HTMLCollectionOf<HTMLDivElement> = document.getElementsByClassName("chatMessage-" + msg.clientId) as HTMLCollectionOf<HTMLDivElement>;
		bubble = bubbles[bubbles.length - 1];
	}
	const msgText: HTMLDivElement = document.createElement("div");
	msgText.classList.add("chatMessageText");
	msgText.dataset.timestamp = msg.timestamp;
	msgText.title = getFullDate(new Date(msg.timestamp));
	msgText.innerHTML = format(msg.message);
	bubble.appendChild(msgText);
	box.appendChild(bubble);

	if (msg.clientId !== Client.id && box.parentElement.classList.contains("displayNone")) {
		// Add red dot to "Chat" button on menubar
		const chatNew: HTMLElement = document.getElementById("chatNew");
		chatNew.style.width = "8px";
		chatNew.style.height = "8px";
		chatNew.style.top = "0";
		chatNew.style.right = "0";
	}

	// Scroll down to the bottom of the messages automatically if was already at bottom
	if (isAtBottom) {
		const tempClassName: string = chatBox.className;
		chatBox.classList.remove("displayNone");
		box.scrollTop = box.scrollHeight - box.clientHeight;
		chatBox.className = tempClassName;
	}
}

export function writePrivateTextTitle(el: HTMLElement, ids: string[]): void {
	let title: string = "Only ";
	for (let i: number = 0; i < ids.length; i++) {
		let clientName: string = "Unknown";
		if (ids[i] === Client.id)
			clientName = "you";
		else
			clientName = (Session.clients[ids[i]].name || ids[i]);
		title += clientName;
		if (i <= ids.length - 2 && ids.length === 2)
			title += " ";
		else if (i <= ids.length - 2)
			title += ", ";
		if (i === ids.length - 2)
			title += "and ";
		el.classList.add("chatPrivateText-" + ids[i]);
	}
	title += " can see this message.";
	el.title = title;
}

export function toggle(): void {
	if (!chatBox.classList.toggle("displayNone"))
		open();
	else
		close();
}

export function open(): void {
	chatBox.classList.remove("displayNone");
	const chatNew: HTMLDivElement = document.getElementById("chatNew") as HTMLDivElement;
	chatNew.style.width = "0";
	chatNew.style.height = "0";
	chatNew.style.top = "4px";
	chatNew.style.right = "4px";
	chatInput.focus();
	Canvas.updateCanvasAreaSize();
}

export function close(): void {
	chatBox.classList.add("displayNone");
	Canvas.updateCanvasAreaSize();
}

export function updateChatInputHeight(): void {
	chatInput.style.height = "0";
	chatInput.style.height = chatInput.scrollHeight + "px";
}
