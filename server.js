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
    console.log("\x1b[36m%s\x1b[0m", `Create session ${this.id} - ${sessions.size} sessions open`);
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
      users: this.clients.size,
      clientIds: [...this.clients].map((c) => c[1].id).filter((id) => id !== client.id)
    });
    client.broadcast({
      type: "user-joined",
      users: this.clients.size,
      clientIds: [client.id]
    });
    console.log("\x1b[35m%s\x1b[0m", `Client ${client.id} joined session ${this.id} - ${this.clients.size} clients in session`);
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
    if (client.connection.readyState === WebSocket.OPEN) {
      client.send({
        type: "leave-session"
      });
    }
    this.clients.delete(client.id);
    console.log("\x1b[35m%s\x1b[0m", `Client ${client.id} left session ${this.id} - ${this.clients.size} clients in session`);
    client.session = null;
    
    this.clients.forEach((c) => {
      c.send({
        type: "user-left",
        users: this.clients.size,
        clientIds: [client.id]
      });
    });
    if (this.clients.size == 0) {
      sessions.delete(this.id);
      delete this;
      console.log("\x1b[36m%s\x1b[0m", `Delete session ${this.id} - ${sessions.size} sessions open`);
    }
  }
}

class Client {
  constructor(connection, id) {
    this.connection = connection;
    this.id = id;
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
}

function joinSession(client, id) {
  const session = sessions.get(id);
  if (session.password) {
    client.send({
      type: "enter-password",
      id: id
    });
  } else {
    session.join(client);
  }
}
function createSession(client, id) {
  const session = new Session(id);
  joinSession(client, id);
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
  console.log("\x1b[33m%s\x1b[0m", `Client connect ${client.id} - ${clients.size} clients connected`);
  socket.on("pong", () => client.isAlive = true);
  const pingClient = setInterval(() => {
    if (client.isAlive === false) return socket.terminate();
    client.isAlive = false;
    socket.ping();
  }, 30000);
  socket.on("error", (error) => {
    throw new Error(error);
  });
  socket.on("close", (code) => {
    clients.delete(client.id);
    console.log("\x1b[33m%s\x1b[0m", `Client disconnect ${client.id} - ${code} - ${clients.size} clients connected`);
    clearInterval(pingClient);
    const session = client.session;
    if (session) session.leave(client);
    socket.close();
    delete client;
  });
  socket.on("message", (msg) => {
    if (msg.slice(0, 4) === "ping") {
      socket.send("pong" + msg.slice(4));
      return;
    }
    const data = JSON.parse(msg);
    switch (data.type) {
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
      case "clear-selection":
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
      /*
      case "start-stroke": {
        client.broadcast(data);
        client.session.currentStrokes.set(data.clientId, {
          colour: data.colour,
          compOp: data.compOp,
          width: data.width,
          caps: data.caps,
          joins: data.joins,
          points: [{
            x: data.x,
            y: data.y
          }]
        });
        break;
      }
      case "add-stroke": {
        client.broadcast(data);
        client.session.currentStrokes.get(data.clientId).points.push({
          x: data.x,
          y: data.y
        });
        break;
      }
      case "end-stroke": {
        client.broadcast(data);
        client.session.strokes.push(client.session.currentStrokes.get(data.clientId));
        client.session.currentStrokes.delete(data.clientId);
        break;
      }
      */
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
        const session = sessions.get(data.id);
        if (!session) {
          client.send({
            type: "session-no-exist",
            id: data.id
          });
        } else if (data.password === session.password) {
          session.join(client);
        } else {
          client.send({
            type: "wrong-password",
            password: data.password,
            id: data.id
          });
        }
        break;
      }
      case "leave-session": {
        const session = client.session;
        if (session) session.leave(client);
        break;
      }
      case "url-session": {
        if (sessions.has(data.id)) {
          joinSession(client, data.id);
        } else {
          createSession(client, data.id);
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
          console.log("\x1b[35m\x1b[1m%s\x1b[0m", `Change session ${client.session.id} to ${data.id}`);
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
        client.session.password = data.password;
        client.send({
          type: "password-set"
        });
        console.log("\x1b[35m\x1b[1m%s\x1b[0m", `Set session ${client.session.id} password ${data.password}`);
        break;
      }
      default: {
        console.log("\x1b[31m%s\x1b[0m", `Unknown message ${data.type}!`, data);
        break;
      }
    }
  });
});
