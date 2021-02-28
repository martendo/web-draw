/*
 * This file is part of Web Draw.
 *
 * Web Draw - A little real-time online collaborative drawing program.
 * Copyright (C) 2020-2021 martendo7
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

const Client = {
  id: null,
  socket: null,
  
  tryReconnect: null,
  reconnectionWait: null,
  
  sendMouse: true,
  mouseInterval: null,
  
  canvas: null,
  ctx: null,
  
  // Send a message to the server
  sendMessage(data) {
    if (!this.socket) return;
    const msg = msgpack.encode(data);
    this.socket.send(msg);
  },
  
  sendMouseMove() {
    if (!mouseMoved.moved) return;
    
    const outside = mouseMoved.x < 0 || mouseMoved.x > Session.canvas.width || mouseMoved.y < 0 || mouseMoved.y > Session.canvas.height;
    if (outside && !mouseMoved.outside) {
      // Just went outside
      this.sendMessage({
        type: Message.MOUSE_MOVE,
        outside: true,
        clientId: this.id
      });
      mouseMoved.outside = true;
    } else if (!outside) {
      // Inside
      this.sendMessage({
        type: Message.MOUSE_MOVE,
        pos: [
          mouseMoved.x,
          mouseMoved.y
        ],
        clientId: this.id
      });
      mouseMoved.outside = false;
    }
    // If already outside and still outside, don't do anything
    
    mouseMoved.moved = false;
  },
  
  setSendMouse(value) {
    this.sendMessage({
      type: Message.SEND_MOUSE,
      value: value
    });
    this.sendMouse = value;
    if (this.sendMouse) {
      if (this.mouseInterval == null) {
        this.mouseInterval = setInterval(() => this.sendMouseMove(), MOUSEMOVE_UPDATE_INTERVAL);
      }
    } else {
      clearInterval(this.mouseInterval);
      this.mouseInterval = null;
    }
  },
  setReceiveMouse(value) {
    this.sendMessage({
      type: Message.RECEIVE_MOUSE,
      value: value
    });
    for (const clientId in clients) {
      if (clientId === this.id) continue;
      document.getElementById("cursorIcon-" + clientId).style.display = value ? "block" : "none";
    }
  },
  
  disconnect() {
    // Signal gave up
    this.socket = 0;
    if (this.tryReconnect != null) clearTimeout(this.tryReconnect);
    Session.leave();
    Modal.close("disconnectModal");
  },
  
  init() {
    // Create WebSocket
    this.socket = new WebSocket(WSS_URL);
    
    // Show error modal on error
    this.socket.onerror = (event) => {
      Modal.open("errorModal");
      console.error("WebSocket error:", event);
    };
    this.socket.onopen = () => {
      Modal.close("disconnectModal");
      Modal.close("errorModal");
      document.getElementById("connectionInfo").style.display = "none";
      const wait = document.getElementById("connectionInfoWait");
      if (wait) wait.style.display = "none";
      document.getElementById("menuOptionsContainer").style.display = "block";
      clearInterval(connectionWait);
      clearTimeout(wakingUp);
      const info = document.getElementById("wakingUpInfo");
      if (info) info.remove();
      
      // If reconnected, try to restore
      if (this.tryReconnect != null) {
        this.sendMessage({
          type: Message.RECONNECT,
          client: {
            id: this.id,
            name: clients[this.id].name
          },
          session: {
            id: Session.id,
            password: Session.password
          }
        });
        return;
      }
      
      // Tell the server if there is a session ID in the URL
      const result = /^\/s\/(.+)$/.exec(location.pathname);
      if (result) {
        const pass = /[?&]pass=(.+?)(?:&|$)/.exec(location.search);
        this.sendMessage({
          type: Message.URL_SESSION,
          id: decodeURIComponent(result[1]),
          password: (pass ? decodeURIComponent(pass[1]) : null)
        });
      }
      // Remove session path in case session isn't joined (e.g. wrong password)
      window.history.replaceState({}, "Web Draw", "/");
      // Query string also removed
      
      // Send mouse movements if mouse has moved
      this.mouseInterval = setInterval(() => this.sendMouseMove(), MOUSEMOVE_UPDATE_INTERVAL);
      
      // Send settings
      document.getElementById("sendMouseMovements").dispatchEvent(new Event("input"));
      document.getElementById("receiveMouseMovements").dispatchEvent(new Event("input"));
    };
    
    // Tell the user when the this.socket has closed
    this.socket.onclose = (event) => {
      if (this.reconnectionWait) clearInterval(this.reconnectionWait);
      if (this.socket === 0) return;
      this.socket = null;
      
      const text = document.getElementById("disconnectText");
      text.innerHTML = `You were disconnected from the server.<br>Code: ${event.code} (${CLOSE_CODES[event.code]})`;
      if (event.reason) text.innerHTML += `<br>Reason: ${event.reason}`;
      
      const connectionInfo = document.getElementById("connectionInfo");
      clearInterval(connectionWait);
      clearTimeout(wakingUp);
      const info = document.getElementById("wakingUpInfo");
      if (info) info.remove();
      connectionInfo.innerHTML = "Disconnected from server. :(<br><br>";
      connectionInfo.className = "connectionInfoDisconnected";
      connectionInfo.style.display = "block";
      const reloadBtn = document.createElement("button");
      reloadBtn.textContent = "Reload";
      reloadBtn.addEventListener("click", () => location.reload());
      connectionInfo.appendChild(reloadBtn);
      document.getElementById("menuOptionsContainer").style.display = "none";
      
      const waitReconnect = () => {
        const wait = document.getElementById("reconnectWait");
        if (wait.textContent.length === 3) wait.textContent = "";
        wait.innerHTML += ".";
      };
      this.reconnectionWait = setInterval(() => waitReconnect(), 500);
      waitReconnect();
      
      Modal.open("disconnectModal");
      this.tryReconnect = setTimeout(() => this.init(), 500);
    };
    
    // Handle messages from the server
    this.socket.onmessage = (event) => {
      const reader = new FileReader();
      reader.onerror = (event) => {
        console.error(`Error reading WebSockets data:`, event.data);
      };
      reader.onload = () => {
        this.handleMessage(new Uint8Array(reader.result));
      };
      reader.readAsArrayBuffer(event.data);
    };
  },
  
  handleMessage(msg) {
    const data = msgpack.decode(msg);
    switch (data.type) {
      // Connection to server established (and acknowledged) - set up client ID
      case Message.CONNECTED: {
        this.id = data.id;
        document.getElementById("clientIdInfo").textContent = this.id;
        document.getElementById("userName").textContent = this.id;
        break;
      }
      case Message.LATENCY: {
        document.getElementById("pingInfo").textContent = data.latency + " ms";
        prevPings.push(data.latency);
        var average = 0;
        for (var i = 0; i < prevPings.length; i++) {
          average += prevPings[i];
        }
        average = parseFloat((average / prevPings.length).toFixed(1));
        document.getElementById("avgPingInfo").textContent = average + " ms";
        
        document.getElementById("minLatency").textContent = prevPings.reduce((a, b) => Math.min(a, b)) + " ms";
        document.getElementById("maxLatency").textContent = prevPings.reduce((a, b) => Math.max(a, b)) + " ms";
        document.getElementById("avgLatency").textContent = average + " ms";
        
        const pingTable = document.getElementById("pingTableBody");
        const row = pingTable.insertRow(-1);
        const numCell = row.insertCell(-1),
              latencyCell = row.insertCell(-1);
        numCell.textContent = prevPings.length;
        latencyCell.textContent = data.latency + " ms";
        
        break;
      }
      // Another user has started a stroke
      case Message.START_STROKE: {
        Session.startClientAction(data.clientId, data.action);
        break;
      }
      // Another user has added a point in their current stroke
      case Message.ADD_STROKE: {
        clients[data.clientId].action.data.points.push([data.pos[0], data.pos[1]]);
        PenTool.drawClientStroke(data.clientId);
        break;
      }
      // Another user has ended their stroke
      case Message.END_STROKE: {
        PenTool.commitStroke(
          clients[data.clientId].canvas,
          clients[data.clientId].action.data
        );
        clients[data.clientId].action.type = null;
        Session.endClientAction(data.clientId);
        break;
      }
      // Another user has undone/redone an action
      case Message.MOVE_HISTORY: {
        ActionHistory.moveTo(data.num);
        break;
      }
      // Another user has toggled visibility of an action
      case Message.TOGGLE_ACTION: {
        ActionHistory.toggleAction(data.num, false);
        break;
      }
      // Another user has moved an action
      case Message.MOVE_ACTION: {
        ActionHistory.moveAction(data.num, data.offset, false);
        break;
      }
      // Another user has used the flood fill tool
      case Message.FILL: {
        FillTool.fill(data.fill);
        break;
      }
      // Another user has cleared the canvas
      case Message.CLEAR: {
        Canvas.clear(false);
        ActionHistory.addToUndo("clear");
        break;
      }
      case Message.CLEAR_BLANK: {
        Canvas.clearBlank(false);
        ActionHistory.addToUndo("clear-blank");
        break;
      }
      // Another user has imported a picture onto the canvas
      case Message.IMPORT_PICTURE: {
        SelectTool.importPicture(data.image, data.clientId);
        break;
      }
      case Message.SELECTION_CREATE: {
        Session.startClientAction(data.clientId, new Action({
          type: Action.SELECTING,
          data: data.selection
        }));
        break;
      }
      case Message.SELECTION_REMOVE: {
        clients[data.clientId].action = {...NO_ACTION};
        Session.endClientAction(data.clientId);
        Canvas.update();
        break;
      }
      // Another user has changed their selection
      case Message.SELECTION_UPDATE: {
        const sel = clients[data.clientId].action.data;
        sel.selected = data.selection.selected;
        sel.x = data.selection.x;
        sel.y = data.selection.y;
        sel.width = data.selection.width;
        sel.height = data.selection.height;
        sel.flipped = data.selection.flipped;
        SelectTool.draw(clients[data.clientId].ctx, sel, false, false);
        break;
      }
      case Message.SELECTION_COPY: {
        SelectTool.copy(clients[data.clientId].ctx, clients[data.clientId].action.data);
        break;
      }
      case Message.SELECTION_CUT: {
        SelectTool.cut(clients[data.clientId].ctx, clients[data.clientId].action.data, data.colour);
        break;
      }
      case Message.SELECTION_PASTE: {
        SelectTool.paste(clients[data.clientId].action.data);
        break;
      }
      case Message.SELECTION_CLEAR: {
        SelectTool.clear(clients[data.clientId].action.data, data.colour);
        break;
      }
      case Message.LINE: {
        Session.startClientAction(data.clientId, new Action({
          type: Action.LINE,
          data: data.line
        }));
        LineTool.draw(data.line, clients[data.clientId].ctx);
        break;
      }
      case Message.COMMIT_LINE: {
        LineTool.draw(data.line, clients[data.clientId].ctx, { save: true });
        ActionHistory.addToUndo("line", data.line);
        Session.endClientAction(data.clientId);
        break;
      }
      case Message.RECT: {
        Session.startClientAction(data.clientId, new Action({
          type: Action.RECT,
          data: data.rect
        }));
        RectTool.draw(data.rect, clients[data.clientId].ctx);
        break;
      }
      case Message.COMMIT_RECT: {
        RectTool.draw(data.rect, clients[data.clientId].ctx, { save: true });
        ActionHistory.addToUndo("rect", data.rect);
        Session.endClientAction(data.clientId);
        break;
      }
      case Message.ELLIPSE: {
        Session.startClientAction(data.clientId, new Action({
          type: Action.ELLIPSE,
          data: data.ellipse
        }));
        EllipseTool.draw(data.ellipse, clients[data.clientId].ctx);
        break;
      }
      case Message.COMMIT_ELLIPSE: {
        EllipseTool.draw(data.ellipse, clients[data.clientId].ctx, { save: true });
        ActionHistory.addToUndo("ellipse", data.ellipse);
        Session.endClientAction(data.clientId);
        break;
      }
      case Message.USER_NAME: {
        clients[data.clientId].name = data.name;
        if (data.clientId === Client.id) document.getElementById("userName").textContent = data.name || Client.id;
        [...document.getElementsByClassName("chatMessageName-" + data.clientId)].forEach((name) => name.textContent = data.name || data.clientId);
        [...document.getElementsByClassName("chatPrivateText-" + data.clientId)].forEach((text) => {
          Chat.writePrivateTextTitle(text, [...text.className.matchAll(/chatPrivateText-([a-z\d]{4})/g)].map((name) => name[1]));
        });
        Session.updateClientTable();
        break;
      }
      case Message.CHAT_MESSAGE: {
        Chat.addMessage(data);
        break;
      }
      // Another user has changed the canvas size
      case Message.RESIZE_CANVAS: {
        Canvas.resize(data.options);
        break;
      }
      // The server needs a copy of the canvas to send to a new user
      case Message.REQUEST_CANVAS: {
        this.sendMessage({
          type: Message.RESPONSE_CANVAS,
          actions: {
            order: Session.actionOrder,
            clients: Object.fromEntries(Object.keys(clients).filter((id) => id !== data.clientId).map((id) => [id, clients[id].action]))
          },
          history: ActionHistory.actions,
          pos: ActionHistory.pos,
          clientId: data.clientId
        });
        break;
      }
      // The server has received a copy of the canvas from the first user
      case Message.RESPONSE_CANVAS: {
        Canvas.setup(data);
        break;
      }
      // Another user has opened a canvas file
      case Message.OPEN_CANVAS: {
        Canvas.setup(msgpack.decode(data.file));
        break;
      }
      // A new user has joined the session
      case Message.USER_JOINED: {
        Session.addUsers([data.client], data.total);
        break;
      }
      // A user has left the session
      case Message.USER_LEFT: {
        Session.removeUsers([data.client], data.total);
        break;
      }
      // Another user has moved their mouse
      case Message.MOUSE_MOVE: {
        const cursor = document.getElementById("cursorIcon-" + data.clientId);
        if (data.outside) {
          cursor.style.display = "none";
        } else {
          const x = (data.pos[0] * Canvas.zoom) + (Canvas.displayCanvas.offsetLeft - Canvas.pan.x);
          const y = (data.pos[1] * Canvas.zoom) + (Canvas.displayCanvas.offsetTop - Canvas.pan.y);
          cursor.style.left = x + "px";
          cursor.style.top = y + "px";
          cursor.style.display = "block";
        }
        break;
      }
      case Message.DISPLAY_CURSOR: {
        document.getElementById("cursorIcon-" + data.clientId).style.display = data.value ? "block" : "none";
        break;
      }
      case Message.PASSWORD_SET: {
        if (data.clientId === this.id) Modal.close("setSessionPasswordModal");
        Session.updatePassword(data.password);
        break;
      }
      case Message.ENTER_PASSWORD: {
        document.getElementById("enterSessionPasswordId").textContent = data.id;
        Modal.open("enterSessionPasswordModal");
        break;
      }
      case Message.WRONG_PASSWORD: {
        document.getElementById("sessionWrongPassword").textContent = data.password;
        document.getElementById("sessionWrongPasswordId").textContent = data.id;
        Modal.open("sessionWrongPasswordModal");
        break;
      }
      // User has joined the session successfully
      case Message.SESSION_JOINED: {
        Modal.close("enterSessionPasswordModal");
        
        document.getElementById("drawScreen").style.display = "grid";
        document.getElementById("menuScreen").style.display = "none";
        if (data.total !== 1) Modal.open("retrieveModal");
        Session.updateId(data.id);
        Session.updatePassword(data.password);
        
        Session.removeUsers(Object.keys(clients), 0);
        Session.addUsers(data.clients, data.total);
        this.canvas = clients[this.id].canvas;
        this.ctx = clients[this.id].ctx;
        
        if (data.restore) break;
        
        ActionHistory.reset();
        
        Slider.init();
        
        Colour.change(0, Colour.DEFAULTS[0], false);
        Colour.change(1, Colour.DEFAULTS[1], false);
        
        document.getElementById("cursorPos").textContent = "0, 0";
        
        // Set up quick colour select colours
        const quickColourSelect = document.getElementById("quickColourSelect");
        const children = quickColourSelect.children;
        for (var i = children.length - 1; i >= 0; i--) {
          children[i].remove();
        }
        Colour.BASICS.values.forEach((row, rowNum) => {
          const quickColourRow = document.createElement("tr");
          quickColourRow.classList.add("quickColourRow");
          row.forEach((col, colNum) => {
            const colour = document.createElement("td");
            colour.classList.add("quickColour");
            colour.style.backgroundColor = col;
            colour.title = `${Colour.BASICS.names[rowNum][colNum]}\nLeft or right click to set colour`;
            colour.addEventListener("click", (event) => Colour.setClicked(event, col));
            colour.addEventListener("contextmenu", (event) => Colour.setClicked(event, col));
            quickColourRow.appendChild(colour);
          });
          quickColourSelect.appendChild(quickColourRow);
        });
        const customColourRow = document.createElement("tr");
        customColourRow.classList.add("quickColourRow");
        customColourRow.id = "customColourRow";
        for (var i = 0; i < Colour.BASICS.values[0].length; i++) {
          const customColour = document.createElement("td");
          customColour.classList.add("quickColour", "customColour");
          customColourRow.appendChild(customColour);
        }
        quickColourSelect.appendChild(customColourRow);
        
        Chat.input.value = "";
        Chat.box.classList.remove("displayNone");
        elementFitHeight(Chat.input);
        Chat.box.classList.add("displayNone");
        
        Canvas.init();
        ActionHistory.addToUndo("[ Base Image ]");
        
        // Resize if too big
        Canvas.setZoom(Canvas.DEFAULT_ZOOM);
        Canvas.zoomToWindow("fit", false);
        
        // Select pen tool
        switchTool("pen");
        
        break;
      }
      // The session the user has tried to join does not exist
      case Message.SESSION_NO_EXIST: {
        Modal.close("enterSessionPasswordModal");
        document.getElementById("sessionNoExist").textContent = data.id;
        Modal.open("sessionNoExistModal");
        break;
      }
      // The session the user has tried to create already exists
      case Message.SESSION_ALREADY_EXIST: {
        document.getElementById("sessionAlreadyExist").textContent = data.id;
        Modal.open("sessionAlreadyExistModal");
        break;
      }
      case Message.SESSION_ID_CHANGED: {
        Session.updateId(data.id);
        if (data.clientId === this.id) {
          Modal.close("changeSessionIdModal");
          document.getElementById("sessionIdChanged").textContent = data.id;
          Modal.open("sessionIdChangedModal");
        }
        break;
      }
      case Message.SESSION_HAS_ID: {
        document.getElementById("sessionHasId").textContent = data.id;
        Modal.open("sessionHasIdModal");
        break;
      }
      // An unknown message has been sent from the server. This should never happen!!!
      default: {
        console.error("Unknown message!", data);
        return;
      }
    }
  }
};
