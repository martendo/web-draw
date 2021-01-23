const Client = {
  id: null,
  socket: null,
  
  // Send a message to the server
  sendMessage(data) {
    const msg = JSON.stringify(data);
    this.socket.send(msg);
  },
  
  init() {
    // Create WebSocket
    this.socket = new WebSocket(WSS_URL);
    
    // Show error modal on error
    this.socket.onerror = (event) => {
      Modal.open("errorModal");
      Session.leave();
      console.error("WebSocket error:", event);
    };
    this.socket.onopen = () => {
      document.getElementById("connectionInfo").style.display = "none";
      document.getElementById("connectionInfoWait").style.display = "none";
      document.getElementById("menuOptionsContainer").style.display = "block";
      clearInterval(connectionWait);
      clearTimeout(wakingUp);
      const info = document.getElementById("wakingUpInfo");
      if (info) info.remove();
      
      // Tell the server if there is a session ID in the URL
      const result = /^\/s\/(.+)$/.exec(location.pathname);
      if (result) {
        const pass = /[?&]pass=(.+?)(?:&|$)/.exec(location.search);
        this.sendMessage({
          type: "url-session",
          id: decodeURIComponent(result[1]),
          password: (pass ? decodeURIComponent(pass[1]) : null)
        });
      }
      // Remove session path in case session isn't joined (e.g. wrong password)
      window.history.replaceState({}, "Web Draw", "/");
      // Query string also removed
      
      // Send mouse movements if mouse has moved
      setInterval(() => {
        if (mouseMoved.moved) {
          const outside = mouseMoved.x < 0 || mouseMoved.x > sessionCanvas.width || mouseMoved.y < 0 || mouseMoved.y > sessionCanvas.height;
          if (outside && !mouseMoved.outside) {
            this.sendMessage({
              type: "mouse-move",
              outside: true,
              clientId: this.id
            });
            mouseMoved.outside = true;
          } else if (!outside) {
            this.sendMessage({
              type: "mouse-move",
              pos: [
                mouseMoved.x,
                mouseMoved.y
              ],
              clientId: this.id
            });
            mouseMoved.outside = false;
          }
          mouseMoved.moved = false;
        }
      }, MOUSEMOVE_UPDATE_INTERVAL);
    };
    
    // Tell the user when the this.socket has closed
    this.socket.onclose = (event) => {
      Session.leave();
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
      Modal.open("disconnectModal");
    };
    
    // Handle messages from the server
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        // Connection to server established (and acknowledged) - set up client ID
        case "connection-established": {
          this.id = data.id;
          document.getElementById("clientIdInfo").textContent = this.id;
          document.getElementById("userName").textContent = this.id;
          break;
        }
        case "latency": {
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
        case "start-stroke": {
          clientStrokes.set(data.clientId, data.data);
          break;
        }
        // Another user has added a point in their current stroke
        case "add-stroke": {
          clientStrokes.get(data.clientId).points.push([data.pos[0], data.pos[1]]);
          Pen.drawClientStroke(data.clientId);
          break;
        }
        // Another user has ended their stroke
        case "end-stroke": {
          Pen.commitStroke(
            clientCanvasses.get(data.clientId),
            clientStrokes.get(data.clientId)
          );
          clientStrokes.delete(data.clientId);
          break;
        }
        // Another user has undone/redone an action
        case "undo": {
          ActionHistory.undo();
          break;
        }
        case "redo": {
          ActionHistory.redo();
          break;
        }
        // Another user has used the flood fill tool
        case "fill": {
          Fill.fill(data.x, data.y, data.colour, data.threshold, data.opacity, data.compOp, data.fillBy, data.changeAlpha);
          break;
        }
        // Another user has cleared the canvas
        case "clear": {
          Canvas.clear(false);
          ActionHistory.addToUndo({
            type: "clear"
          });
          break;
        }
        case "clear-blank": {
          Canvas.clearBlank(false);
          ActionHistory.addToUndo({
            type: "clear-blank"
          });
          break;
        }
        // Another user has imported a picture onto the canvas
        case "import-picture": {
          const img = new Image();
          img.addEventListener("load", () => {
            sessionCtx.drawImage(img, 0, 0);
          });
          img.src = data.image;
          break;
        }
        case "create-selection": {
          clientSelections.set(data.clientId, {});
          break;
        }
        case "remove-selection": {
          clientSelections.delete(data.clientId);
          const canvas = clientCanvasses.get(data.clientId);
          canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
          break;
        }
        // Another user has changed their selection
        case "selection-update": {
          const sel = clientSelections.get(data.clientId);
          sel.selected = data.selection.selected;
          sel.x = data.selection.x;
          sel.y = data.selection.y;
          sel.width = data.selection.width;
          sel.height = data.selection.height;
          sel.flipped = data.selection.flipped;
          Selection.draw(clientCanvasses.get(data.clientId).getContext("2d"), sel, false, false);
          break;
        }
        case "selection-copy": {
          Selection.copy(clientCanvasses.get(data.clientId).getContext("2d"), clientSelections.get(data.clientId));
          break;
        }
        case "selection-cut": {
          Selection.cut(clientCanvasses.get(data.clientId).getContext("2d"), clientSelections.get(data.clientId), data.colour);
          break;
        }
        case "selection-paste": {
          Selection.paste(clientSelections.get(data.clientId));
          break;
        }
        case "selection-clear": {
          Selection.clear(clientSelections.get(data.clientId), data.colour);
          break;
        }
        case "line": {
          const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
          clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
          Line.draw(data.line, clientCtx);
          break;
        }
        case "commit-line": {
          const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
          clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
          Line.draw(data.line, clientCtx, true);
          ActionHistory.addToUndo({
            type: "line",
            line: data.line
          });
          break;
        }
        case "rect": {
          const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
          clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
          Rect.draw(data.rect, clientCtx);
          break;
        }
        case "commit-rect": {
          const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
          clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
          Rect.draw(data.rect, clientCtx, true);
          ActionHistory.addToUndo({
            type: "rect",
            rect: data.rect
          });
          break;
        }
        case "ellipse": {
          const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
          clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
          Ellipse.draw(data.ellipse, clientCtx);
          break;
        }
        case "commit-ellipse": {
          const clientCtx = clientCanvasses.get(data.clientId).getContext("2d");
          clientCtx.clearRect(0, 0, clientCtx.canvas.width, clientCtx.canvas.height);
          Ellipse.draw(data.ellipse, clientCtx, true);
          ActionHistory.addToUndo({
            type: "ellipse",
            ellipse: data.ellipse
          });
          break;
        }
        case "user-name": {
          clients.get(data.clientId).name = data.name;
          [...document.getElementsByClassName("chatMessageName-" + data.clientId)].forEach((name) => name.textContent = data.name);
          [...document.getElementsByClassName("chatPrivateText-" + data.clientId)].forEach((text) => {
            Chat.writePrivateTextTitle(text, [...text.className.matchAll(/chatPrivateText-([a-z\d]{4})/g)].map((name) => name[1]));
          })
          Session.updateClientTable();
          break;
        }
        case "chat-message": {
          Chat.addMessage(data);
          break;
        }
        // Another user has changed the canvas size
        case "resize-canvas": {
          Canvas.resize(data.width, data.height, data.colour);
          break;
        }
        // The server needs a copy of the canvas to send to a new user
        case "request-canvas": {
          const sendClientStrokes = currentAction.type === "stroke"
            ? Object.fromEntries([...clientStrokes, [this.id, currentAction.data]])
            : Object.fromEntries([...clientStrokes]);
          this.sendMessage({
            type: "response-canvas",
            width: sessionCanvas.width,
            height: sessionCanvas.height,
            strokes: sendClientStrokes,
            undoActions: ActionHistory.undoActions,
            redoActions: ActionHistory.redoActions,
            clientId: data.clientId
          });
          break;
        }
        // The server has recieved a copy of the canvas from the first user
        case "response-canvas": {
          Canvas.setup(data);
          break;
        }
        // A new user has joined the session
        case "user-joined": {
          Session.addUsers([data.client], data.total);
          break;
        }
        // A user has left the session
        case "user-left": {
          Session.removeUsers(data.client, data.total);
          break;
        }
        // Another user has moved their mouse
        case "mouse-move": {
          const cursor = document.getElementById("cursorIcon-" + data.clientId);
          if (data.outside) {
            cursor.style.display = "none";
          } else {
            const x = (data.pos[0] * Canvas.zoom) + (Canvas.canvas.offsetLeft + (Canvas.canvas.clientLeft * Canvas.zoom)) - Canvas.container.scrollLeft;
            const y = (data.pos[1] * Canvas.zoom) + (Canvas.canvas.offsetTop + (Canvas.canvas.clientTop * Canvas.zoom)) - Canvas.container.scrollTop;
            cursor.style.left = x + "px";
            cursor.style.top = y + "px";
            cursor.style.display = "block";
          }
          break;
        }
        case "password-set": {
          if (data.clientId === this.id) Modal.close("setSessionPasswordModal");
          Session.updatePassword(data.password);
          break;
        }
        case "enter-password": {
          document.getElementById("enterSessionPasswordId").textContent = data.id;
          Modal.open("enterSessionPasswordModal");
          break;
        }
        case "wrong-password": {
          document.getElementById("sessionWrongPassword").textContent = data.password;
          document.getElementById("sessionWrongPasswordId").textContent = data.id;
          Modal.open("sessionWrongPasswordModal");
          break;
        }
        // User has joined the session successfully
        case "session-joined": {
          Modal.close("enterSessionPasswordModal");
          
          document.getElementById("menuScreen").style.display = "none";
          document.getElementById("drawScreen").style.display = "grid";
          if (data.total !== 1) Modal.open("retrieveModal");
          Session.updateId(data.id);
          Session.updatePassword(data.password);
          ActionHistory.clearUndo();
          ActionHistory.clearRedo();
          
          Slider.init();
          
          changeColour(START_COLOURS[0], 0, false);
          changeColour(START_COLOURS[1], 1, false);
          
          document.getElementById("lineCapSelect").value = 0;
          
          document.getElementById("cursorPos").textContent = "0, 0";
          
          document.getElementById("compositeSelect").value = 0;
          
          document.getElementById("fillBySelect").value = 0;
          document.getElementById("fillChangeAlpha").checked = true;
          
          document.getElementById("colourPickerMerge").checked = false;
          document.getElementById("colourPickerOpacity").checked = false;
          
          document.getElementById("shapeOutline").checked = true;
          document.getElementById("shapeFill").checked = false;
          
          // Select pen tool
          switchTool(PEN_TOOL);
          
          // Set up quick colour select colours
          const quickColourSelect = document.getElementById("quickColourSelect");
          const children = quickColourSelect.children;
          for (var i = children.length - 1; i >= 0; i--) {
            children[i].remove();
          }
          BASIC_COLOURS.values.forEach((row, rowNum) => {
            const quickColourRow = document.createElement("tr");
            quickColourRow.classList.add("quickColourRow");
            row.forEach((col, colNum) => {
              const colour = document.createElement("td");
              colour.classList.add("quickColour");
              colour.style.backgroundColor = col;
              colour.title = `${BASIC_COLOURS.names[rowNum][colNum]}\nLeft or right click to set colour`;
              colour.addEventListener("click", (event) => setClickedPenColour(event, col));
              colour.addEventListener("contextmenu", (event) => setClickedPenColour(event, col));
              quickColourRow.appendChild(colour);
            });
            quickColourSelect.appendChild(quickColourRow);
          });
          const customColourRow = document.createElement("tr");
          customColourRow.classList.add("quickColourRow");
          customColourRow.id = "customColourRow";
          for (var i = 0; i < BASIC_COLOURS.values[0].length; i++) {
            const customColour = document.createElement("td");
            customColour.classList.add("quickColour", "customColour");
            customColourRow.appendChild(customColour);
          }
          quickColourSelect.appendChild(customColourRow);
          
          Chat.input.value = "";
          Chat.box.classList.remove("displayNone");
          elementFitHeight(Chat.input);
          Chat.box.classList.add("displayNone");
          
          // Set canvas size
          sessionCanvas.width = Canvas.CANVAS_WIDTH;
          sessionCanvas.height = Canvas.CANVAS_HEIGHT;
          thisCanvas.width = Canvas.CANVAS_WIDTH;
          thisCanvas.height = Canvas.CANVAS_HEIGHT;
          Canvas.canvas.width = Canvas.CANVAS_WIDTH;
          Canvas.canvas.height = Canvas.CANVAS_HEIGHT;
          // Resize if too big
          Canvas.setZoom(Canvas.DEFAULT_ZOOM);
          Canvas.zoomToWindow("fit", false);
          // Start with the canvas cleared
          Canvas.clearBlank(false);
          
          Session.addUsers(data.clients, data.total);
          
          break;
        }
        // The session the user has tried to join does not exist
        case "session-no-exist": {
          Modal.close("enterSessionPasswordModal");
          document.getElementById("sessionNoExist").textContent = data.id;
          Modal.open("sessionNoExistModal");
          break;
        }
        // The session the user has tried to create already exists
        case "session-already-exist": {
          document.getElementById("sessionAlreadyExist").textContent = data.id;
          Modal.open("sessionAlreadyExistModal");
          break;
        }
        case "session-id-changed": {
          Session.updateId(data.id);
          if (data.clientId === this.id) {
            Modal.close("changeSessionIdModal");
            document.getElementById("sessionIdChanged").textContent = data.id;
            Modal.open("sessionIdChangedModal");
          }
          break;
        }
        case "session-has-id": {
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
    };
  }
};