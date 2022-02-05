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

import {minmax} from "../helpers";

let current: string | null = null;

// Callback functions
const CALLBACKS: {[key: string]: (value: number) => void} = {
	"updateColourAlpha": (value: number) => {
		for (let i: number = 0; i < 2; i++) {
			const colourValue: HTMLInputElement = document.getElementById(`penColour${i}Value`) as HTMLInputElement;
			colourValue.value = colourValue.value.slice(0, -2) + ("0" + Math.round(value / 100 * 255).toString(16)).slice(-2);
			document.getElementById("penColour" + i).style.backgroundColor = colourValue.value;
		}
	},
};

// All the slider inputs to set up
const DEFAULT_VALUES: {[key: string]: number} = {
	"size": 10,
	"opacity": 100,
	"fillThreshold": 15,
};

const enum SliderDir {
	UP,
	DOWN,
}

export function init(): void {
	// Set up slider inputs
	const sliders: HTMLCollectionOf<HTMLDivElement> = document.getElementsByClassName("sliderInput") as HTMLCollectionOf<HTMLDivElement>;
	for (var i: number = 0; i < sliders.length; i++) {
		const id: string = sliders[i].id.slice(0, -("Input".length));
		setValue(id, DEFAULT_VALUES[id], null, false);
	}
}

function update(event: PointerEvent): void {
	if (current === null)
		return;
	const input: HTMLInputElement = document.getElementById(current + "Input") as HTMLInputElement;
	const rect: DOMRect = input.getBoundingClientRect();
	const dx: number = event.clientX - rect.left;
	const fraction: number = dx / rect.width;
	const min: number = parseFloat(input.dataset.min);
	const value: number = minmax((fraction * (parseFloat(input.dataset.width) - min)) + min, min, parseFloat(input.dataset.max));
	setValue(current, value, fraction);
}

export function setValue(id: string, value: number, fraction: number | null = null, callback: boolean = true): void {
	const input: HTMLInputElement = document.getElementById(id + "Input") as HTMLInputElement;
	const strvalue: string = value.toFixed(parseInt(input.dataset.fdigits, 10));
	input.dataset.value = strvalue;
	document.getElementById(id + "Value").textContent = strvalue;

	const min: number = parseFloat(input.dataset.min);
	if (fraction === null)
		fraction = (value - min) / (parseFloat(input.dataset.width) - min);
	document.getElementById(id + "Bar").style.width = minmax(fraction * 100, 0, 100) + "%";

	if (input.dataset.callback && callback)
		CALLBACKS[input.dataset.callback](value);
}
function arrow(id: string, dir: SliderDir): void {
	const slider: HTMLInputElement = document.getElementById(id + "Input") as HTMLInputElement;
	const newVal: number = minmax(parseFloat(slider.dataset.value) + (dir === SliderDir.UP ? 1 : -1), parseFloat(slider.dataset.min), parseFloat(slider.dataset.max));
	setValue(id, newVal);
}

const sliders: HTMLCollectionOf<HTMLDivElement> = document.getElementsByClassName("sliderInput") as HTMLCollectionOf<HTMLDivElement>;
for (let i: number = 0; i < sliders.length; i++) {
	const slider: HTMLDivElement = sliders[i];
	const id: string = slider.id.slice(0, -("Input".length));
	document.getElementById(id + "Value").addEventListener("keydown", (event) => {
		if (event.key !== "Enter")
			return;
		event.preventDefault();
		// Manually enter a value
		let value: number = parseFloat((event.target as HTMLDivElement).textContent);
		if (typeof value !== "number" || isNaN(value))
			return;
		value = minmax(value, parseFloat(slider.dataset.min), parseFloat(slider.dataset.max));
		setValue(id, value);
	});
	// Use up/down arrows
	const up: HTMLDivElement = document.getElementById(id + "ValueUp") as HTMLDivElement;
	const down: HTMLDivElement = document.getElementById(id + "ValueDown") as HTMLDivElement;
	// Up arrow
	up.addEventListener("pointerdown", (event) => {
		// Increment value once first
		arrow(id, SliderDir.UP);
		// After holding for a bit...
		upTimeout = window.setTimeout(function repeatUp() {
			// ...increment again
			arrow(id, SliderDir.UP);
			// Faster incrementing after holding for a while
			upTimeout = window.setTimeout(() => repeatUp(), 30);
		}, 300);
		event.stopPropagation();
	});
	// Down arrow
	down.addEventListener("pointerdown", (event) => {
		arrow(id, SliderDir.DOWN);
		downTimeout = window.setTimeout(function repeatDown() {
			arrow(id, SliderDir.DOWN);
			downTimeout = window.setTimeout(() => repeatDown(), 30);
		}, 300);
		event.stopPropagation();
	});
	// Clicked on slider and not on arrows or anything else; move bar
	slider.addEventListener("pointerdown", (event) => {
		current = id;
		update(event);
	});
}

document.addEventListener("pointermove", (event) => update(event));

let upTimeout: number;
let downTimeout: number;
document.addEventListener("pointerup", () => {
	current = null;
	clearTimeout(upTimeout);
	clearTimeout(downTimeout);
});
