"use strict";

const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const sessions = new Map;
const clients = new Map;

function createId(len = 4, chars = "bcdfghjklmnpqrstvwxyz0123456789") {
  var id = "";
  while (len--) {
    id += chars[Math.random() * chars.length | 0];
  }
  return id;
}

class Session {
  constructor(id) {
    this.id = id;
    this.clients = new Map;
    this.password = null;
    sessions.set(this.id, this);
    console.log(`Create session ${this.id} - ${sessions.size} sessions open`);
  }
  
  join(client) {
    if (client.session) {
      console.error("Client already in session!");
    }
    this.clients.set(client.id, client);
    client.session = this;
    client.send({
      type: "session-joined",
      id: this.id,
      total: this.clients.size,
      clients: [...this.clients.values()].map((c) => {
        return {
          id: c.id,
          name: c.name
        };
      }),
      password: this.password
    });
    client.broadcast({
      type: "user-joined",
      total: this.clients.size,
      client: {
        id: client.id,
        name: client.name
      }
    });
    console.log(`Client ${client.id} joined session ${this.id} - ${this.clients.size} clients in session`);
    if (this.clients.size !== 1) {
      [...this.clients.values()][0].send({
        type: "request-canvas",
        clientId: client.id
      });
    }
  }
  
  leave(client) {
    if (client.session !== this) {
      console.error("Client not in this session!");
    }
    this.clients.delete(client.id);
    client.broadcast({
      type: "user-left",
      total: this.clients.size,
      client: {
        id: client.id,
        name: client.name
      }
    });
    client.session = null;
    console.log(`Client ${client.id} left session ${this.id} - ${this.clients.size} clients in session`);
    
    if (this.clients.size == 0) {
      sessions.delete(this.id);
      delete this;
      console.log(`Delete session ${this.id} - ${sessions.size} sessions open`);
    }
  }
  
  setPassword(client, password) {
    this.password = password;
    client.send({
      type: "password-set",
      password: this.password,
      clientId: client.id
    });
    client.broadcast({
      type: "password-set",
      password: this.password,
      clientId: client.id
    });
    console.log(`Set session ${this.id} password ${password}`);
  }
}

class Client {
  constructor(connection, id) {
    this.connection = connection;
    this.id = id;
    this.name = null;
    this.session = null;
    this.isAlive = true;
    clients.set(this.id, this);
  }
  
  broadcast(data) {
    if (this.session) {
      this.session.clients.forEach((client) => {
        if (client !== this) client.send(data);
      });
    }
  }
  
  send(data) {
    const msg = JSON.stringify(data);
    this.connection.send(msg, (error) => {
      if (error) console.error("Message send failed", msg, error);
    });
  }
  
  ping() {
    if (!this.isAlive) return this.connection.terminate();
    this.isAlive = false;
    this.pingTime = Date.now();
    this.connection.ping();
  }
}

function joinSession(client, id, pass = null) {
  const session = sessions.get(id);
  if (session.password) {
    if (pass) {
      checkSessionPassword(client, id, pass);
    } else {
      client.send({
        type: "enter-password",
        id: id
      });
    }
  } else {
    session.join(client);
  }
}
function createSession(client, id, pass = null) {
  const session = new Session(id);
  joinSession(client, id);
  session.setPassword(client, pass);
}
function checkSessionPassword(client, id, password) {
  const session = sessions.get(id);
  if (!session) {
    client.send({
      type: "session-no-exist",
      id: id
    });
  } else if (password === session.password) {
    session.join(client);
  } else {
    client.send({
      type: "wrong-password",
      password: password,
      id: id
    });
  }
}

wss.on("connection", (socket) => {
  let id = createId();
  while (clients.has(id)) {
    id = createId();
  }
  const client = new Client(socket, id);
  client.send({
    type: "connection-established",
    id: client.id
  });
  console.log(`Client connect ${client.id} - ${clients.size} clients connected`);
  socket.on("pong", () => {
    client.send({
      type: "latency",
      latency: Date.now() - client.pingTime
    });
    client.isAlive = true;
  });
  const pingClient = setInterval(() => client.ping(), 10000);
  setTimeout(() => client.ping(), 1000);
  socket.on("error", (error) => {
    console.error(error);
  });
  socket.on("close", (code) => {
    clients.delete(client.id);
    console.log(`Client disconnect ${client.id} - ${code} - ${clients.size} clients connected`);
    clearInterval(pingClient);
    const session = client.session;
    if (session) session.leave(client);
    socket.close();
  });
  socket.on("message", (msg) => {
    const data = JSON.parse(msg);
    switch (data.type) {
      case "user-name": {
        client.name = data.name;
        client.send(data);
        // Fallthrough
      }
      case "fill":
      case "clear":
      case "clear-blank":
      case "import-picture":
      case "resize-canvas":
      case "undo":
      case "redo":
      case "start-stroke":
      case "add-stroke":
      case "end-stroke":
      case "mouse-move":
      case "create-selection":
      case "remove-selection":
      case "selection-update":
      case "selection-copy":
      case "selection-cut":
      case "selection-paste":
      case "selection-clear":
      case "line":
      case "commit-line":
      case "rect":
      case "commit-rect":
      case "ellipse":
      case "commit-ellipse": {
        client.broadcast(data);
        break;
      }
      case "chat-message": {
        if (data.message.slice(0, 3) === "to:") {
          const idList = data.message.split(" ")[0].slice(3);
          var ids = idList.split(",");
          ids = ids.filter((id) => client.session.clients.has(id));
          if (ids.length === 0) break;
          ids.push(client.id);
          ids = [...new Set(ids)];
          ids.forEach((id) => {
            client.session.clients.get(id).send({
              type: "chat-message",
              message: data.message.slice(3 + idList.length + 1),
              clientId: client.id,
              priv: ids,
              timestamp: Date.now()
            });
          });
        } else {
          data.timestamp = Date.now();
          client.broadcast(data);
          client.send(data);
        }
        break;
      }
      case "response-canvas": {
        client.session.clients.get(data.clientId).send(data);
        break;
      }
      case "create-session": {
        let id = data.id;
        if (id == "") {
          id = createId();
          while (sessions.has(id)) {
            id = createId();
          }
        }
        if (sessions.has(id)) {
          client.send({
            type: "session-already-exist",
            id: id
          });
        } else {
          createSession(client, id);
        }
        break;
      }
      case "join-session": {
        if (sessions.has(data.id)) {
          joinSession(client, data.id);
        } else {
          client.send({
            type: "session-no-exist",
            id: data.id
          });
        }
        break;
      }
      case "enter-password": {
        checkSessionPassword(client, data.id, data.password);
        break;
      }
      case "leave-session": {
        const session = client.session;
        if (session) session.leave(client);
        break;
      }
      case "url-session": {
        if (sessions.has(data.id)) {
          joinSession(client, data.id, data.password);
        } else {
          createSession(client, data.id, data.password);
        }
        break;
      }
      case "session-id": {
        if (sessions.has(data.id)) {
          client.send({
            type: "session-has-id",
            id: data.id
          });
        } else {
          console.log(`Change session ${client.session.id} to ${data.id}`);
          sessions.delete(client.session.id);
          client.session.id = data.id;
          sessions.set(client.session.id, client.session);
          client.send({
            type: "session-id-changed",
            id: data.id,
            clientId: client.id
          });
          client.broadcast({
            type: "session-id-changed",
            id: data.id,
            clientId: client.id
          });
        }
        break;
      }
      case "session-password": {
        client.session.setPassword(client, data.password);
        break;
      }
      default: {
        console.log(`Unknown message ${data.type}!`, data);
        break;
      }
    }
  });
});