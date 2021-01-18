# [Web Draw](https://w-draw.web.app) ![Pen Logo](/public/img/pen.png)
[![version](https://img.shields.io/github/tag/martendo7/web-draw.svg?style=flat&label=version)](https://github.com/martendo7/web-draw/tags)

A little real-time online drawing program. [https://w-draw.web.app]()

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
- ![pen](/public/img/pen.png) Pen Tool
- ![flood-fill](/public/img/flood-fill.png) Flood Fill Tool
- ![colour-picker](/public/img/colour-picker.png) Colour Picker Tool
- ![select](/public/img/select.png) Rectangular Select Tool
- ![line](/public/img/line.png) Line Tool
- ![rect](/public/img/rect.png) Rectangle Tool
- ![ellipse](/public/img/ellipse.png) Ellipse Tool

## How do you use it?
Web Draw is fairly similar to most drawing programs in terms of how they are used.
The "Help" section in the app goes into detail of what does what.

## What is it for?
The idea came from wanting to be able to sketch out ideas with a group of people together online, but we didn't know of a way to do so.
I then decided I'd make something myself. A couple of days later, the first version of Web Draw was made!

## How does it *really* work?
Web Draw uses WebSockets for the "Web" part, and the Canvas API for the "Draw" part.

The WebSockets server uses Node's [ws module](https://github.com/websockets/ws) and speaks JSON with its clients.
Whenever somebody does something, the server is told about it, and if necessary, the server then tells everybody else about it.

The client-side code and interface is plain HTML, CSS, and JavaScript. Nothing fancy.

---

## What's where
```
./
├─ .github/workflows
│  └─ deploy.yaml
├─ public/
│  ├─ img/
│  │  └─ ...
│  ├─ index.html
│  ├─ script.js
│  ├─ style.css
│  └─ ...
├─ README.md
└─ server.js
└─ ...
```
- `.github/workflows/deploy.yaml` - GitHub Actions workflow to deploy to Firebase Hosting
- `public` - All the files the client needs; the root directory of the site
  - `img` - All the images (except favicon.ico, if that counts)
- `server.js` - The WebSockets server
