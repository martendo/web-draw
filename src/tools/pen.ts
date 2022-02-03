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
import {Message} from "../message";
import * as ActionHistory from "../action-history";
import {PastActionType} from "../action-history";
import * as Canvas from "../canvas";
import * as Client from "../client";
import * as Session from "../session";
import {Action, ActionType} from "../session";

export class Stroke {
	points: [number, number][];
	colour: string;
	size: number;
	caps: Canvas.LineCap;
	opacity: number;
	compOp: Canvas.CompositeOp;
	smoothen: boolean;

	constructor({points, colour, size, caps, opacity, compOp, smoothen}: Stroke) {
		this.points = points;
		this.colour = colour;
		this.size = size;
		this.caps = caps;
		this.opacity = opacity;
		this.compOp = compOp;
		this.smoothen = smoothen;
	}

	static packer(stroke: Stroke): Uint8Array {
		return msgpack.encode([
			stroke.points,
			stroke.colour,
			stroke.size,
			stroke.caps,
			stroke.opacity,
			stroke.compOp,
			stroke.smoothen,
		]).slice(1);
	}

	static unpacker(buffer: Uint8Array): Stroke {
		const properties: [[number, number][], string, number, number, number, Canvas.CompositeOp, boolean] = msgpack.decode([0x97, ...new Uint8Array(buffer)]);
		return new Stroke({
			points: properties[0],
			colour: properties[1],
			size: properties[2],
			caps: properties[3],
			opacity: properties[4],
			compOp: properties[5],
			smoothen: properties[6],
		});
	}
}

// Add a point to the current stroke and draw it
export function draw(x: number, y: number): void {
	const currentAction: Action = Session.clients[Client.id].action;
	if (currentAction.type !== ActionType.STROKE)
		return;
	const lastPoint: [number, number] = currentAction.data.points[currentAction.data.points.length - 1];
	if (currentAction.data.points.length > 0 && x === lastPoint[0] && y === lastPoint[1])
		return;
	Client.sendMessage({
		type: Message.ADD_STROKE,
		clientId: Client.id,
		pos: [x, y],
	});
	currentAction.data.points.push([x, y]);
	drawStroke(Client.ctx, currentAction.data);
	Session.clients[Client.id].action = currentAction;
}

// Add a point to another client's current stroke and draw it
export function drawClientStroke(clientId: string): void {
	const action: Action = Session.clients[clientId].action;
	if (action.type !== ActionType.STROKE)
		return;
	drawStroke(Session.clients[clientId].ctx, action.data);
}

// Commit a stroke to the session canvas (copy it then erase it)
export function commitStroke(srcCanvas: HTMLCanvasElement, stroke: Stroke, user: boolean = true): void {
	Canvas.update({save: true});
	srcCanvas.getContext("2d").clearRect(0, 0, srcCanvas.width, srcCanvas.height);
	if (user)
		ActionHistory.append(PastActionType.STROKE, stroke);
}

// Draw a full stroke
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, options?): void {
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	ctx.strokeStyle = stroke.colour;
	ctx.lineCap = Canvas.CAPS[stroke.caps];
	ctx.lineJoin = "round";
	ctx.lineWidth = stroke.size;
	ctx.globalAlpha = stroke.opacity;

	ctx.beginPath();
	ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);

	if (stroke.smoothen) {
		let i: number;
		for (i = 0; i < stroke.points.length - 1; i++) {
			const p0: [number, number] = stroke.points[i];
			const p1: [number, number] = stroke.points[i + 1];
			const midPoint: [number, number] = [
				(p0[0] + p1[0]) / 2,
				(p0[1] + p1[1]) / 2,
			];
			ctx.quadraticCurveTo(p0[0], p0[1], midPoint[0], midPoint[1]);
		}
		ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
	} else {
		for (let i: number = 0; i < stroke.points.length; i++)
			ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
	}

	ctx.stroke();

	ctx.globalAlpha = 1;

	Canvas.update(options);
}
