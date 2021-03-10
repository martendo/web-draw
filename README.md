# [Web Draw](https://w-draw.web.app) ![Pen Logo](/src/img/pen.png)
[![Version](https://img.shields.io/github/v/tag/martendo7/web-draw?label=version)](https://github.com/martendo7/web-draw/tags)
[![Website](https://img.shields.io/website?down_color=inactive&down_message=offline&up_color=success&up_message=online&url=https%3A%2F%2Fw-draw.web.app)](https://w-draw.web.app)

A little real-time online collaborative drawing program. https://w-draw.web.app

## What is it?
Web Draw is a web app that lets you draw on a shared canvas with other people in real time!

It's currently a little rough, but I'm constantly improving it.

## How does it work?
Web Draw uses *sessions*, which connect users together.
Everybody in a given session works on the same canvas - what one user is drawing the others can see.

Each session has a unique *session ID*. It can be whatever you want, as long as it isn't already taken.
If you can't decide on one when creating a session, you can leave the session ID box on the main page blank for a random 4-character ID.
A session's ID can be changed at any time - once again, as long as it isn't already taken.

Sessions can also optionally have a password set on them, so that only users that have the password can join.
A session's password can be set or removed at any time.

## What can you draw?
Well, pretty much anything.

These are the tools that are currently available:
- ![pen](/src/img/pen.png) Pen Tool
- ![flood-fill](/src/img/flood-fill.png) Flood Fill Tool
- ![colour-picker](/src/img/colour-picker.png) Colour Picker Tool
- ![select](/src/img/select.png) Rectangular Select Tool
- ![line](/src/img/line.png) Line Tool
- ![rect](/src/img/rect.png) Rectangle Tool
- ![ellipse](/src/img/ellipse.png) Ellipse Tool

## How do you use it?
Web Draw is fairly similar to most drawing programs in terms of how they are used.
The "Help" section in the app goes into detail of what does what.

## What is it for?
The idea came from wanting to be able to sketch out ideas with a group of people together online, but we didn't know of a way to do so.
I then decided I'd make something myself. A couple of days later, the first version of Web Draw was made!

## How does it *really* work?
Web Draw uses WebSockets for the "Web" part, and the Canvas API for the "Draw" part.

The WebSockets server uses Node's [ws module](https://github.com/websockets/ws) and speaks [MessagePack](https://msgpack.org) with its clients using [msgpack-lite](https://github.com/kawanet/msgpack-lite).
Whenever somebody does something, the server is told about it, and if necessary, the server then tells everybody else about it.

The client-side code and interface is plain HTML, CSS, and JavaScript. Nothing fancy.

---

## What's where
```
./
├── .github/workflows/
│   └── build-deploy.yaml
├── public/
│   ├── app.webmanifest
│   ├── favicon.ico
│   └── ...
├── src/
│   ├── img/
│   │   └── ...
│   ├── tools/
│   │   └── ...
│   ├── ui/
│   │   └── ...
│   ├── 404.html
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── ...
├── Gruntfile.js
├── README.md
├── server.js
└── ...
```
- `.github/workflows/build-deploy.yaml` - GitHub Actions workflow to "build" code and deploy to Firebase Hosting
- `public` - All the files the client needs; the root directory of the site
  - Code in `src` is minified and placed in this directory
- `src` - Source code of the web app
  - `img` - All icons used in the app, inserted in source code as Base64 strings at build
- `Gruntfile.js` - Script to minify code, insert build date and version, Base64 images, and copyright notices, and copy over to `public`
- `server.js` - The WebSockets server
