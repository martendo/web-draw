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
import * as Canvas from "./canvas";

export class Vector2<Type> {
	x: Type;
	y: Type;

	constructor(x: Type, y: Type) {
		this.x = x;
		this.y = y;
	}

	static packer(pos: Vector2<any>): Uint8Array {
		return msgpack.encode([
			pos.x,
			pos.y,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): Vector2<any> {
		const properties: [number, number] = msgpack.decode([0x92, ...new Uint8Array(buffer)]);
		return new Vector2<any>(properties[0], properties[1]);
	}
}

export const DOCUMENT_STYLE: Readonly<CSSStyleDeclaration> = window.getComputedStyle(document.documentElement);

// Copy text to the clipboard
export function copyText(text: string, event = null): void {
	navigator.clipboard.writeText(text).catch(() => {
		console.log("navigator.clipboard.writeText failed");
		const textarea: HTMLTextAreaElement = document.createElement("textarea");
		textarea.style.position = "fixed";
		textarea.style.top = "-1000px";
		textarea.value = text;
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand("copy");
		document.body.removeChild(textarea);
	});
	if (event) {
		const tooltip: HTMLSpanElement = document.getElementById("tooltip") as HTMLSpanElement;
		tooltip.textContent = "Copied!";
		tooltip.style.left = (event.clientX + 20) + "px";
		tooltip.style.top = (event.clientY - 30) + "px";
		tooltip.style.visibility = "visible";
		setTimeout(() => {
			tooltip.style.visibility = "hidden";
		}, 1000);
	}
}

export function setTheme(theme) {
	document.documentElement.className = theme;
	localStorage.setItem("theme", theme);
	// Background and scrollbar colours have changed
	Canvas.drawCanvas();
}

// Check if a point is within an area
export function isPointInside(x: number, y: number, rect): boolean {
	return (
		rect.x <= x && x < rect.x + rect.width
		&& rect.y <= y && y < rect.y + rect.height
	);
}

// Use an upper and lower bound on a number
export function minmax(num: number, min: number, max: number): number {
	return Math.min(Math.max(num, min), max);
}
