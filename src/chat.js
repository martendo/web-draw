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

const Chat = {
  box: document.getElementById("chatBox"),
  input: document.getElementById("chatInput"),
  
  send() {
    const msg = this.input.value;
    const indexSpace = msg.indexOf(" ");
    if (msg.trim() === "" || (msg.slice(0, 3) === "to:" && (msg.slice(indexSpace).trim() === "" || indexSpace === -1))) return;
    this.input.value = "";
    const box = document.getElementById("chatMessages");
    const isAtBottom = box.scrollTop == box.scrollHeight - box.clientHeight;
    elementFitHeight(this.input);
    if (isAtBottom) box.scrollTop = box.scrollHeight - box.clientHeight;
    Client.sendMessage({
      type: "chat-message",
      message: msg,
      clientId: Client.id
    });
  },
  
  getFullDate(date) {
    var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()],
        day = date.getDate(),
        year = date.getFullYear(),
        hours = date.getHours(),
        amPm = hours < 12 ? "AM" : "PM",
        minutes = ("0" + date.getMinutes()).substr(-2),
        seconds = ("0" + date.getSeconds()).substr(-2);
    hours %= 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds} ${amPm}`;
  },
  
  addMessageTo(id) {
    if (this.input.value.slice(0, 3) === "to:") {
      // "to:" at beginning of message, already has list
      const split = this.input.value.split(" ");
      // List of IDs already contains ID
      if (split[0].slice(3).split(",").includes(id)) return;
      const toLen = split[0].length;
      // Add to the existing list: A comma if there is already an ID in it, the new ID, space and the rest of the message
      this.input.value = this.input.value.slice(0, toLen) + (toLen === 3 ? "" : ",") + id + " " + (this.input.value.slice(toLen + 1) || "");
    } else {
      // Message doesn't have a "to:" list yet, add one;
      this.input.value = `to:${id} ` + (this.input.value.slice(0, 1) === " " ? this.input.value.slice(1) : this.input.value);
    }
    elementFitHeight(this.input);
    this.input.focus();
  },
  
  addMessage(msg) {
    // Replace characters that can interfere with HTML, and do markdown styling
    msg.message = msg.message
      .replace(/&/g, "&#38;")
      .replace(/</g, "&#60;")
      .replace(/>/g, "&#62;")
      .replace(/(^|[^\\])((?:\\{2})*)\*\*([\s\S]*?[^\\](?:\\{2})*)\*\*/mg, "$1$2<strong>$3</strong>") // **bold**
      .replace(/(^|[^\\])((?:\\{2})*)__([\s\S]*?[^\\](?:\\{2})*)__/mg, "$1$2<u>$3</u>")               // __underlined__
      .replace(/(^|[^\\])((?:\\{2})*)~~([\s\S]*?[^\\](?:\\{2})*)~~/mg, "$1$2<s>$3</s>")               // ~~strikethrough~~
      .replace(/(^|[^\\*])((?:\\{2})*)\*([\s\S]*?[^\\*](?:\\{2})*)\*/mg, "$1$2<em>$3</em>")           // *italicized*
      .replace(/(^|[^\\_])((?:\\{2})*)_([\s\S]*?[^\\_](?:\\{2})*)_/mg, "$1$2<em>$3</em>")             // _italicized_
      .replace(/\\([\s\S])/mg, "$1")
      .replace(/\\/g, "&#92;");
    const client = clients.get(msg.clientId);
    const box = document.getElementById("chatMessages");
    var bubble;
    const last = box.children[box.children.length - 1];
    // Quirk that is actually wanted: When chatBox is not displayed, its dimensions are all 0, so isAtBottom is true
    // 14 = 8px padding, 1px border, 5px margin
    const isAtBottom = box.scrollHeight - box.clientHeight <= box.scrollTop + (last ? last.children[last.children.length - 1].getBoundingClientRect().height : 0) + 14;
    // Create new message bubble if last message was not from the same person or is not of the same type or it was 3 or more minutes ago
    if (!last || parseInt(last.children[last.children.length - 1].dataset.timestamp, 10) + 1000*60*3 <= msg.timestamp ||
      (msg.priv ? (!last.classList.contains("chatMessage-" + client.id) || !last.classList.contains("chatMessagePrivate-" + msg.priv))
                : (!last.classList.contains("chatMessage-" + client.id) || last.classList.contains("chatMessagePrivate")))) {
      bubble = document.createElement("div");
      bubble.classList.add("chatMessageBubble", "chatMessage-" + client.id);
      const nameRow = document.createElement("div");
      nameRow.classList.add("chatMessageNameRow");
      const name = document.createElement("a");
      name.classList.add("chatMessageName", "chatMessageName-" + client.id);
      name.textContent = client.name || client.id;
      name.title = client.id;
      name.href = "javascript:void(0)";
      name.addEventListener("click", () => this.addMessageTo(client.id));
      nameRow.appendChild(name);
      const time = document.createElement("span");
      time.classList.add("chatMessageTime");
      const timestamp = new Date(msg.timestamp);
      var hours = timestamp.getHours();
      const amPm = hours < 12 ? "AM" : "PM";
      hours %= 12;
      hours = hours ? hours : 12;
      time.textContent = `${hours}:${("0" + timestamp.getMinutes()).slice(-2)} ${amPm}`;
      time.title = this.getFullDate(timestamp);
      nameRow.appendChild(time);
      if (msg.priv) {
        bubble.classList.add("chatMessagePrivate", "chatMessagePrivate-" + msg.priv);
        const privateText = document.createElement("span");
        privateText.classList.add("chatPrivateText");
        privateText.textContent = "Private";
        this.writePrivateTextTitle(privateText, msg.priv);
        nameRow.appendChild(privateText);
      }
      bubble.appendChild(nameRow);
    } else {
      // Message is the same type as the last, just add to the bottom of the previous bubble
      bubble = document.getElementsByClassName("chatMessage-" + client.id);
      bubble = bubble[bubble.length - 1];
    }
    const msgText = document.createElement("div");
    msgText.classList.add("chatMessageText");
    msgText.dataset.timestamp = msg.timestamp;
    msgText.title = this.getFullDate(new Date(msg.timestamp));
    msgText.innerHTML = msg.message;
    bubble.appendChild(msgText);
    box.appendChild(bubble);
    
    if (msg.clientId !== Client.id && box.parentElement.classList.contains("displayNone")) {
      // Add red dot to "Chat" button on menubar
      const chatNew = document.getElementById("chatNew");
      chatNew.style.width = "8px";
      chatNew.style.height = "8px";
      chatNew.style.top = "0";
      chatNew.style.right = "0";
    }
    
    // Scroll down to the bottom of the messages automatically if was already at bottom
    if (isAtBottom) {
      const tempClassName = this.box.className;
      this.box.classList.remove("displayNone");
      box.scrollTop = box.scrollHeight - box.clientHeight;
      this.box.className = tempClassName;
    }
  },
  
  writePrivateTextTitle(el, ids) {
    var title = "Only ";
    for (var i = 0; i < ids.length; i++) {
      var clientName = "Unknown";
      if (ids[i] === Client.id) {
        clientName = "you";
      } else {
        const toClient = clients.get(ids[i]);
        clientName = (toClient.name || toClient.id);
      }
      title += clientName;
      if (i <= ids.length - 2 && ids.length === 2) {
        title += " ";
      } else if (i <= ids.length - 2) {
        title += ", ";
      }
      if (i === ids.length - 2) {
        title += "and ";
      }
      el.classList.add("chatPrivateText-" + ids[i]);
    }
    title += " can see this message.";
    el.title = title;
  },
  
  toggle() {
    if (!this.box.classList.toggle("displayNone")) this.open();
  },
  open() {
    const chatNew = document.getElementById("chatNew");
    chatNew.style.width = 0;
    chatNew.style.height = 0;
    chatNew.style.top = "4px";
    chatNew.style.right = "4px";
    this.input.focus();
  }
};

function elementFitHeight(el) {
  el.style.height = 0;
  el.style.height = el.scrollHeight + "px";
}
