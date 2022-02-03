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

import * as Slider from "./ui/slider";

// Starting pen colours
export const DEFAULTS: readonly [string, string] = ["#000000", "#ffffff"];
// Blank canvas colour
export const BLANK: string = "#ffffff";

// Basic colours for quick selection
// Stolen from MS Paint
export const BASICS: {values: readonly string[][], names: readonly string[][]} = {
	values: [
		[
			"#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27",
			"#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4",
		],
		[
			"#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e",
			"#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7",
		],
	],
	names: [
		[
			"Black", "Grey-50%", "Dark red", "Red", "Orange",
			"Yellow", "Green", "Turquoise", "Indigo", "Purple",
		],
		[
			"White", "Grey-25%", "Brown", "Rose", "Gold",
			"Light yellow", "Lime", "Light turquoise", "Blue-grey", "Lavender",
		],
	],
};

export type ColourArray = [number, number, number, number];

// Current pen colours
export let currents: [string, string] = Object.assign([], DEFAULTS);

// Most recent custom colours
let customColours: string[] = [];

// Index into currents of the colour currently being modified
let modifying: 0 | 1;

// Convert hex colour value to an RGBA array
export function hexToRgb(colour: string, alpha: number = 255): ColourArray | null {
	const result: RegExpExecArray = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colour);
	return result ? [
		parseInt(result[1], 16),
		parseInt(result[2], 16),
		parseInt(result[3], 16),
		alpha,
	] : null;
}

export function rgbToHex(colour: ColourArray): string {
	return "#" + ("00000" + ((colour[0] << 16) + (colour[1] << 8) + colour[2]).toString(16)).substr(-6);
}

// Open the colour picker
export function openPicker(num: 0 | 1): void {
	modifying = num;
	const colourPicker: HTMLInputElement = document.getElementById("colourPicker") as HTMLInputElement;
	const colourRect: DOMRect = document.getElementById("penColour" + num).getBoundingClientRect();
	colourPicker.style.left = colourRect.x + "px";
	colourPicker.style.top = (colourRect.y + colourRect.height) + "px";
	colourPicker.value = currents[num];
	setTimeout(() => colourPicker.click(), 10);
}

// Set one of the colours
export function change(num: 0 | 1 | null, value: string, addCustom: boolean = true): void {
	if (num === null)
		num = modifying;
	update(num, value);
	currents[num] = value;
	if (addCustom) {
		// Check if colour is one of the basic colours, if it is, don't add it to the custom colours
		for (let i: number = 0; i < BASICS.values.length; i++) {
			if (BASICS.values[i].indexOf(value) !== -1)
				return;
		}
		// Check if colour is already in custom colours, if it is, move to last (remove then push)
		const sameColourIndex: number = customColours.indexOf(value);
		if (sameColourIndex !== -1)
			customColours.splice(sameColourIndex, 1);
		customColours.push(value);
		const customColourBoxes: HTMLCollectionOf<HTMLTableCellElement> = document.getElementById("customColourRow").children as HTMLCollectionOf<HTMLTableCellElement>;
		if (customColours.length > customColourBoxes.length)
			customColours.shift();
		for (let i: number = 0; i < customColours.length; i++) {
			const colourBox: HTMLTableCellElement = customColourBoxes[i];
			const col: string = customColours[i];
			colourBox.style.backgroundColor = col;
			colourBox.title = `${col}\nLeft or right click to set colour`;
			colourBox.onclick = (event) => setClicked(event, col);
			colourBox.oncontextmenu = (event) => setClicked(event, col);
		}
	}
}

// Update colour value if value is a hex colour
export function changeWithValue(num: 0 | 1, event: KeyboardEvent): void {
	let value: string = (event.currentTarget as HTMLInputElement).value;
	const hex: RegExpExecArray = /^#?([a-f\d]{6}|[a-f\d]{8}|[a-f\d]{3}|[a-f\d]{4})$/i.exec(value);
	if (hex) {
		let alpha: number;
		if (hex[1].length < 6) {
			const r: string = hex[1].slice(0, 1);
			const g: string = hex[1].slice(1, 2);
			const b: string = hex[1].slice(2, 3);
			value = r+r+g+g+b+b;
			if (hex[1].length === 4) {
				const a: string = hex[1].slice(3, 4);
				alpha = parseInt(a+a, 16);
			}
		}
		if (value.slice(0, 1) !== "#")
			value = "#" + value;
		if (value.length > 6+1) {
			alpha = parseInt(value.slice(-2), 16);
			value = value.slice(0, -2);
		}
		if (typeof alpha !== "undefined") {
			const newOpacity: number = (alpha / 255) * 100;
			Slider.setValue("opacity", newOpacity);
		}
		change(num, value);
	} else {
		update(num, (event.currentTarget as HTMLInputElement).dataset.lastValue);
	}
}

// Update colour value and box, but don't set the colour
export function update(num: 0 | 1 | null, value: string): void {
	if (num === null)
		num = modifying;
	const valueWithAlpha: string = value + ("0" + Math.round(parseFloat(document.getElementById("opacityInput").dataset.value) / 100 * 255).toString(16)).slice(-2);
	document.getElementById("penColour" + num).style.backgroundColor = valueWithAlpha;
	const colourValue: HTMLInputElement = document.getElementById(`penColour${num}Value`) as HTMLInputElement;
	colourValue.value = valueWithAlpha;
	colourValue.dataset.lastValue = value;
}

// Set the colour for the mouse button that was clicked
export function setClicked(event: MouseEvent, col: string): void {
	let num: 0 | 1;
	switch (event.button) {
		case 0:
			num = 0;
			break;
		case 2:
			num = 1;
			break;
		default:
			return;
	}
	event.preventDefault();
	change(num, col, false);
}
