/*
 * This file is part of Web Draw.
 *
 * Web Draw - A little real-time online drawing program.
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

const Session = {
  id: null,
  password: null,
  link: location.origin,
  
  // Add/Remove a user canvas and mouse and update the total
  addUsers(c, total) {
    c.forEach((client) => {
      if (client.id !== Client.id) {
        const img = document.createElement("img");
        img.src = "/img/cursor.png";
        img.classList.add("cursorIcon");
        img.id = "cursorIcon-" + client.id;
        document.body.appendChild(img);
      }
      const clientCanvas = document.createElement("canvas");
      clientCanvas.classList.add("clientCanvas");
      clientCanvas.id = "clientCanvas-" + client.id;
      clientCanvas.width = sessionCanvas.width;
      clientCanvas.height = sessionCanvas.height;
      clientCanvas.style.transform = `scale(${Canvas.zoom})`;
      Canvas.container.appendChild(clientCanvas);
      clients[client.id] = {
        name: client.name,
        canvas: clientCanvas,
        ctx: clientCanvas.getContext("2d"),
        action: { type: null }
      };
    });
    this.updateUserInfo(total);
  },
  removeUsers(client, total) {
    delete clients[client.id];
    if (client.id !== Client.id) {
      const img = document.getElementById("cursorIcon-" + client.id);
      img.remove();
      document.getElementById("clientCanvas-" + client.id).remove();
    }
    this.updateUserInfo(total);
  },
  // Update the total number of users connected to the current session
  updateUserInfo(num) {
    var isAre = "are", s = "s";
    if (num == 1) {
      isAre = "is";
      s = "";
    }
    document.getElementById("userBox").innerHTML = `There ${isAre} <a href="javascript:void(0)" id="userCount">${num} user${s}</a> connected to this session.`;
    document.getElementById("userCount").onclick = () => Modal.open("sessionInfoModal");
    
    document.getElementById("sessionInfoClients").textContent = num;
    this.updateClientTable();
  },
  
  updateClientTable() {
    const table = document.getElementById("sessionInfoClientBody");
    for (var i = table.children.length - 1; i >= 0; i--) {
      table.removeChild(table.children[i]);
    }
    for (const [clientId, client] of Object.entries(clients)) {
      const row = table.insertRow(-1),
            idCell = row.insertCell(0),
            nameCell = row.insertCell(1);
      idCell.textContent = clientId;
      nameCell.textContent = client.name;
      row.classList.add("sessionInfoClient");
      if (clientId === Client.id) row.classList.add("sessionInfoThisClient");
      row.title = "Click to send private message";
      row.addEventListener("click", () => {
        Chat.box.classList.remove("displayNone");
        Chat.open();
        Chat.addMessageTo(client.id);
        Modal.close("sessionInfoModal");
      });
    }
  },
  
  // Request to create a new session
  create() {
    Client.sendMessage({
      type: "create-session",
      id: document.getElementById("sessionIdInput").value
    });
  },
  // Request to join a session
  join() {
    Client.sendMessage({
      type: "join-session",
      id: document.getElementById("sessionIdInput").value
    });
  },
  // Leave a session
  leave() {
    Client.sendMessage({
      type: "leave-session"
    });
    
    document.getElementById("menuScreen").style.display = "grid";
    document.getElementById("drawScreen").style.display = "none";
    const cursors = document.getElementsByClassName("cursorIcon");
    for (var i = 0; i < cursors.length; i++) {
      cursors[i].remove();
    }
    window.history.replaceState({}, "Web Draw", "/");
    document.getElementById("sessionIdInfo").textContent = "N/A";
    
    this.id = null;
  },
  
  changeId() {
    Client.sendMessage({
      type: "session-id",
      id: document.getElementById("sessionIdNew").value
    });
  },
  
  updateId(id) {
    this.id = id;
    window.history.replaceState({}, `${this.id} - Web Draw`, `/s/${encodeURIComponent(this.id)}`);
    document.getElementById("sessionId").textContent = this.id;
    document.getElementById("sessionIdInfo").textContent = this.id;
    document.getElementById("sessionIdCurrent").textContent = this.id;
    document.getElementById("sessionInfoId").textContent = this.id;
    this.updateLink();
  },
  
  updatePassword(password) {
    this.password = password;
    const text = document.getElementById("sessionPasswordCurrent");
    if (password === null) {
      text.textContent = "There is currently no password set on this session.";
    } else {
      text.innerHTML = `Current password: <span class="clickToCopy lightBox" title="Copy" id="currentPassword">${this.password}</span>`;
      const current = document.getElementById("currentPassword");
      current.onclick = (event) => copyText(current.textContent, event);
    }
    this.updateLink();
  },
  
  updateLink() {
    this.link = `${location.origin}/s/${encodeURIComponent(this.id)}`;
    const includePassword = document.getElementById("sessionLinkPassword");
    const includePasswordInput = document.getElementById("sessionLinkPasswordInput");
    if (this.password !== null) {
      if (includePasswordInput.checked) this.link += `?pass=${encodeURIComponent(this.password)}`;
      includePassword.style.display = "block";
    } else {
      includePassword.style.display = "none";
    }
    document.getElementById("sessionLink").textContent = this.link;
  },
  
  setPassword() {
    Client.sendMessage({
      type: "session-password",
      password: document.getElementById("sessionPasswordNew").value
    });
  },
  
  enterPassword() {
    Client.sendMessage({
      type: "enter-password",
      password: document.getElementById("enterSessionPassword").value,
      id: document.getElementById("enterSessionPasswordId").textContent
    });
  },
  
  saveUserSettings() {
    const name = document.getElementById("userNameInput").value;
    if (name !== clients.get(Client.id).name) {
      Client.sendMessage({
        type: "user-name",
        name: name,
        clientId: Client.id
      });
      document.getElementById("userName").textContent = name;
    }
    Modal.close("userModal");
  }
};
