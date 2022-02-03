# Web Draw ![Pen Logo](/src/img/pen.png)
[![Version](https://img.shields.io/github/v/tag/martendo/web-draw?label=version)](https://github.com/martendo/web-draw/tags)
[![Website](https://img.shields.io/website?down_color=inactive&down_message=offline&up_color=success&up_message=online&url=https%3A%2F%2Fw-draw.web.app)](https://w-draw.web.app)

A little real-time online collaborative drawing program. <https://w-draw.web.app>

Web Draw is a web app that allows users to draw on a shared canvas in real time.
It's currently a little rough, but is seeing some improvement here and there.

## How does it work?
Web Draw uses *sessions*, which connect users together.
All users in a session work on the same canvas.

Each session has a unique *session ID*, which can be set to anything.
A random 4-character session ID is generated if one is not provided.
A session's ID can be changed at any time so long as the new ID isn't already taken.

Sessions can also optionally have a password set on them, so that only users who are able to provide the password can join.
A session's password can be changed or removed at any time.

## Currently available tools
- ![pen](/src/img/pen.png) Pen Tool
- ![eraser](/src/img/eraser.png) Eraser Tool
- ![flood-fill](/src/img/flood-fill.png) Flood Fill Tool
- ![colour-picker](/src/img/colour-picker.png) Colour Picker Tool
- ![select](/src/img/select.png) Rectangular Select Tool
- ![line](/src/img/line.png) Line Tool
- ![rect](/src/img/rect.png) Rectangle Tool
- ![ellipse](/src/img/ellipse.png) Ellipse Tool

## How does it *really* work?
Web Draw uses WebSockets for the "Web" part, and the web Canvas API for the "Draw" part.

The WebSockets server uses the [ws module] for Node.js and speaks [MessagePack] with its clients using [msgpack-lite].
When a user performs an action, the server is told about it, and if necessary, then tells all other session members about it.

[ws module]: https://github.com/websockets/ws
[MessagePack]: https://msgpack.org
[msgpack-lite]: https://github.com/kawanet/msgpack-lite
