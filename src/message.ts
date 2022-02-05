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

export const enum Message {
	CONNECTED,
	LATENCY,

	CREATE_SESSION,
	JOIN_SESSION,
	URL_SESSION,
	SESSION_JOINED,
	USER_JOINED,
	SESSION_NO_EXIST,
	SESSION_ALREADY_EXIST,
	LEAVE_SESSION,
	USER_LEFT,

	SESSION_ID,
	SESSION_HAS_ID,
	SESSION_ID_CHANGED,
	SESSION_PASSWORD,
	PASSWORD_SET,
	ENTER_PASSWORD,
	WRONG_PASSWORD,

	RECONNECT,
	SEND_MOUSE,
	RECEIVE_MOUSE,
	DISPLAY_CURSOR,
	USER_NAME,
	MOUSE_MOVE,
	CHAT_MESSAGE,

	START_STROKE,
	ADD_STROKE,
	END_STROKE,
	FILL,
	SELECTION_CREATE,
	SELECTION_REMOVE,
	SELECTION_UPDATE,
	SELECTION_COPY,
	SELECTION_CUT,
	SELECTION_PASTE,
	SELECTION_CLEAR,
	LINE,
	COMMIT_LINE,
	RECT,
	COMMIT_RECT,
	ELLIPSE,
	COMMIT_ELLIPSE,
	CLEAR,
	CLEAR_BLANK,

	REQUEST_CANVAS,
	RESPONSE_CANVAS,

	IMPORT_IMAGE,
	OPEN_CANVAS,
	RESIZE_CANVAS,

	MOVE_HISTORY,
	TOGGLE_ACTION,
	MOVE_ACTION,
};
