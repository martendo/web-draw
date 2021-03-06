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

import * as WebSocket from "ws";
import * as msgpack from "msgpack-lite";
import {Message} from "./src/message";

const wss: WebSocket.Server = new WebSocket.Server({port: parseInt(process.env.PORT, 10) || 3000});

const sessions: Map<string, Session> = new Map();
const clients: Map<string, Client> = new Map();

function createUniqueId(map: Map<string, unknown>, len: number = 4, chars: string = "bcdfghjklmnpqrstvwxyz0123456789"): string {
	let id: string;
	do {
		id = "";
		for (let i: number = 0; i < len; i++)
			id += chars[(Math.random() * chars.length) | 0];
	} while (map.has(id));
	return id;
}

class Session {
	id: string;
	clients: Map<string, Client>;
	password: string | null;

	constructor(id: string) {
		this.id = id;
		this.clients = new Map();
		this.password = null;
		sessions.set(this.id, this);
		console.log(`Create session ${this.id} - ${sessions.size} sessions open`);
	}

	join(client: Client, restore: boolean = false): void {
		if (client.session)
			console.error("Client already in session!");
		this.clients.set(client.id, client);
		client.session = this;
		client.send({
			type: Message.SESSION_JOINED,
			id: this.id,
			total: this.clients.size,
			clients: [...this.clients.values()].map((c: Client): {id: string, name: string} => {
				return {
					id: c.id,
					name: c.name,
				};
			}),
			password: this.password,
			restore: restore,
		});
		client.broadcast({
			type: Message.USER_JOINED,
			total: this.clients.size,
			client: {
				id: client.id,
				name: client.name,
			},
		});
		console.log(`Client ${client.id} joined session ${this.id} - ${this.clients.size} clients in session`);
		if (this.clients.size !== 1) {
			[...this.clients.values()][0].send({
				type: Message.REQUEST_CANVAS,
				clientId: client.id,
			});
		}
	}

	leave(client: Client): void {
		if (client.session !== this)
			console.error("Client not in this session!");
		this.clients.delete(client.id);
		client.broadcast({
			type: Message.USER_LEFT,
			total: this.clients.size,
			client: {
				id: client.id,
				name: client.name,
			},
		});
		client.session = null;
		console.log(`Client ${client.id} left session ${this.id} - ${this.clients.size} clients in session`);

		if (this.clients.size === 0) {
			sessions.delete(this.id);
			console.log(`Delete session ${this.id} - ${sessions.size} sessions open`);
		}
	}

	// Send a message to all clients in this session
	broadcast(data: any): void {
		this.clients.forEach((client: Client): void => {
			client.send(data);
		});
	}

	setPassword(client: Client, password: string | null): void {
		this.password = password;
		this.broadcast({
			type: Message.PASSWORD_SET,
			password: this.password,
			clientId: client.id,
		});
		console.log(`Set session ${this.id} password ${password}`);
	}
}

class Client {
	connection: WebSocket;
	id: string;
	name: string | null;
	session: Session | null;
	isAlive: boolean;
	pingTime: number;
	receiveMouse: boolean;

	constructor(connection: WebSocket, id: string) {
		this.connection = connection;
		this.id = id;
		this.name = null;
		this.session = null;
		this.isAlive = true;
		this.receiveMouse = true;
		clients.set(this.id, this);
	}

	// Send a message to all other clients in session except this client
	broadcast(data: any, callback: (Client) => boolean = null) {
		if (!this.session)
			return;

		this.session.clients.forEach((client: Client): void => {
			if (client !== this) {
				if (typeof callback === "function") {
					if (!callback(client))
						return;
				}
				client.send(data);
			}
		});
	}

	// Send a message to this client
	send(data: any): void {
		const msg: Buffer = msgpack.encode(data);
		this.connection.send(msg, {binary: true}, (error: Error) => {
			if (error)
				console.error("Message send failed", msg, error);
		});
	}

	ping(): void {
		if (!this.isAlive) {
			this.connection.terminate();
			return;
		}
		this.isAlive = false;
		this.connection.ping((): void => {
			this.pingTime = Date.now();
		});
	}
}

function joinSession(client: Client, id: string, pass: string | null = null, restore: boolean = false): void {
	const session: Session = sessions.get(id);
	if (session.password) {
		if (pass) {
			checkSessionPassword(client, id, pass);
		} else {
			client.send({
				type: Message.ENTER_PASSWORD,
				id: id,
			});
		}
	} else {
		session.join(client, restore);
	}
}

function createSession(client: Client, id: string, pass: string | null = null, restore: boolean = false): Session {
	const session: Session = new Session(id);
	joinSession(client, id, pass, restore);
	session.setPassword(client, pass);
	return session;
}

function checkSessionPassword(client: Client, id: string, password: string | null): void {
	const session: Session = sessions.get(id);
	if (!session) {
		client.send({
			type: Message.SESSION_NO_EXIST,
			id: id,
		});
	} else if (password === session.password) {
		session.join(client);
	} else {
		client.send({
			type: Message.WRONG_PASSWORD,
			password: password,
			id: id,
		});
	}
}

wss.on("connection", (socket: WebSocket): void => {
	const client: Client = new Client(socket, createUniqueId(clients));
	client.send({
		type: Message.CONNECTED,
		id: client.id,
	});
	console.log(`Client connect ${client.id} - ${clients.size} clients connected`);
	socket.on("pong", (): void => {
		const latency: number = Date.now() - client.pingTime;
		client.send({
			type: Message.LATENCY,
			latency: latency,
		});
		client.isAlive = true;
	});
	const pingClient: NodeJS.Timer = setInterval((): void => client.ping(), 10000);
	setTimeout((): void => client.ping(), 1000);
	socket.on("error", (error: Error): void => {
		console.error(error);
	});
	socket.on("close", (code: number): void => {
		clients.delete(client.id);
		console.log(`Client disconnect ${client.id} - ${code} - ${clients.size} clients connected`);
		clearInterval(pingClient);
		const session: Session | null = client.session;
		if (session)
			session.leave(client);
		socket.close();
	});
	socket.on("message", (msg: Buffer): void => {
		const data: {type: Message, [key: string]: any} = msgpack.decode(msg);
		switch (data.type) {
			case Message.FILL:
			case Message.CLEAR:
			case Message.CLEAR_BLANK:
			case Message.IMPORT_IMAGE:
			case Message.OPEN_CANVAS:
			case Message.RESIZE_CANVAS:
			case Message.MOVE_HISTORY:
			case Message.TOGGLE_ACTION:
			case Message.MOVE_ACTION:
			case Message.START_STROKE:
			case Message.ADD_STROKE:
			case Message.END_STROKE:
			case Message.SELECTION_CREATE:
			case Message.SELECTION_REMOVE:
			case Message.SELECTION_UPDATE:
			case Message.SELECTION_COPY:
			case Message.SELECTION_CUT:
			case Message.SELECTION_PASTE:
			case Message.SELECTION_CLEAR:
			case Message.LINE:
			case Message.COMMIT_LINE:
			case Message.RECT:
			case Message.COMMIT_RECT:
			case Message.ELLIPSE:
			case Message.COMMIT_ELLIPSE:
				client.broadcast(data);
				break;
			case Message.MOUSE_MOVE:
				client.broadcast(data, (c: Client): boolean => c.receiveMouse);
				break;
			case Message.CHAT_MESSAGE:
				const timestamp: number = Date.now();
				if (data.message.slice(0, 3) === "to:") {
					const idList: string = data.message.split(" ")[0].slice(3);
					let ids: Array<string> = idList.split(",");
					// Remove recipients who are not in client's session
					ids = ids.filter((id: string): boolean => client.session.clients.has(id));
					// Sending to nobody, end
					if (ids.length === 0)
						break;

					// Show sender the message
					ids.push(client.id);
					// Remove duplicate recipients
					ids = [...new Set(ids)];
					ids.forEach((id: string): void => {
						client.session.clients.get(id).send({
							type: Message.CHAT_MESSAGE,
							message: data.message.slice(3 + idList.length + 1),
							clientId: client.id,
							priv: ids,
							timestamp: timestamp,
						});
					});
				} else {
					data.timestamp = timestamp;
					client.session.broadcast(data);
				}
				break;
			case Message.USER_NAME:
				client.name = data.name;
				client.session.broadcast(data);
				break;
			case Message.RESPONSE_CANVAS:
				client.session.clients.get(data.clientId).send(data);
				break;
			case Message.CREATE_SESSION:
				let id: string = data.id;
				if (id === "")
					id = createUniqueId(sessions);
				if (sessions.has(id)) {
					client.send({
						type: Message.SESSION_ALREADY_EXIST,
						id: id,
					});
				} else {
					createSession(client, id);
				}
				break;
			case Message.JOIN_SESSION:
				if (sessions.has(data.id)) {
					joinSession(client, data.id);
				} else {
					client.send({
						type: Message.SESSION_NO_EXIST,
						id: data.id,
					});
				}
				break;
			case Message.ENTER_PASSWORD:
				checkSessionPassword(client, data.id, data.password);
				break;
			case Message.LEAVE_SESSION:
				const session: Session | null = client.session;
				if (session)
					session.leave(client);
				break;
			case Message.URL_SESSION:
				if (sessions.has(data.id))
					joinSession(client, data.id, data.password);
				else
					createSession(client, data.id, data.password);
				break;
			case Message.RECONNECT:
				if (data.client.id && !clients.has(data.client.id)) {
					clients.delete(client.id);
					client.id = data.client.id;
					clients.set(client.id, client);
				}
				client.name = data.client.name;
				client.send({
					type: Message.CONNECTED,
					id: client.id,
				});

				if (data.session.id && !sessions.has(data.session.id)) {
					if (client.session)
						sessions.delete(client.session.id);
					client.session = createSession(client, data.session.id, data.session.password, true);
					sessions.set(client.session.id, client.session);
				} else {
					joinSession(client, data.session.id, data.session.password);
				}
				client.session.broadcast({
					type: Message.USER_NAME,
					name: client.name,
					clientId: client.id,
				});

				break;
			case Message.SESSION_ID:
				if (sessions.has(data.id)) {
					client.send({
						type: Message.SESSION_HAS_ID,
						id: data.id,
					});
				} else {
					console.log(`Change session ${client.session.id} to ${data.id}`);
					sessions.delete(client.session.id);
					client.session.id = data.id;
					sessions.set(client.session.id, client.session);
					client.session.broadcast({
						type: Message.SESSION_ID_CHANGED,
						id: data.id,
						clientId: client.id,
					});
				}
				break;
			case Message.SESSION_PASSWORD:
				client.session.setPassword(client, data.password);
				break;
			case Message.SEND_MOUSE:
				client.broadcast({
					type: Message.DISPLAY_CURSOR,
					clientId: client.id,
					value: data.value,
				});
				break;
			case Message.RECEIVE_MOUSE:
				client.receiveMouse = data.value;
				break;
			default:
				console.error(`Unknown message ${data.type}!`, data);
				break;
		}
	});
});
