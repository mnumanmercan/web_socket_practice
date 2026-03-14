/**
 * PHASE 4: Full TypeScript Chat Server with Rooms
 *
 * New concepts introduced here:
 *   - Rooms (pub/sub fan-out pattern)
 *   - Message ID generation for deduplication
 *   - Structured logging
 *   - Graceful shutdown (SIGINT/SIGTERM)
 *
 * Run with:  npx ts-node src/phase4/server.ts
 */

import WebSocket, { WebSocketServer } from "ws";
import { createServer } from "http";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { C2SMessage, S2CMessage } from "./protocol";

// ─────────────────────────────────────────────
// DOMAIN MODELS
// ─────────────────────────────────────────────

interface Client {
  id: string;
  ws: WebSocket;
  username: string | null;
  rooms: Set<string>;
}

interface Room {
  id: string;
  name: string;
  members: Set<string>; // Set of client IDs
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

const clients = new Map<string, Client>();
const rooms = new Map<string, Room>();

// Pre-create some rooms so users have somewhere to go
function seedRooms(): void {
  const defaults = [
    { id: "general", name: "General" },
    { id: "random", name: "Random" },
    { id: "tech", name: "Tech Talk" },
  ];
  for (const r of defaults) {
    rooms.set(r.id, { ...r, members: new Set() });
  }
}

seedRooms();

// ─────────────────────────────────────────────
// HTTP + WS SERVER
// Serves the HTML client file AND handles WebSocket upgrades
// ─────────────────────────────────────────────

const PORT = 8081;

const httpServer = createServer((req, res) => {
  // Only serve the chat page
  if (req.url === "/" || req.url === "/index.html") {
    const html = readFileSync(join(__dirname, "public", "index.html"), "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
  console.log("Open two browser tabs to test the chat!\n");
});

// ─────────────────────────────────────────────
// CONNECTION HANDLER
// ─────────────────────────────────────────────

wss.on("connection", (ws: WebSocket) => {
  const client: Client = {
    id: randomUUID(),
    ws,
    username: null,
    rooms: new Set(),
  };

  clients.set(client.id, client);
  log("connect", client.id);

  send(ws, {
    type: "WELCOME",
    userId: client.id,
    timestamp: Date.now(),
  });

  ws.on("message", (data) => {
    const raw = data.toString();
    let msg: C2SMessage;
    try {
      msg = JSON.parse(raw) as C2SMessage;
    } catch {
      send(ws, error("INVALID_JSON", "Message must be valid JSON"));
      return;
    }
    handleMessage(client, msg);
  });

  ws.on("close", (code) => {
    log("disconnect", `${client.username ?? client.id} (code ${code})`);
    // Remove from all rooms
    client.rooms.forEach((roomId) => leaveRoom(client, roomId));
    clients.delete(client.id);
  });

  ws.on("error", (err) => log("error", err.message));
});

// ─────────────────────────────────────────────
// MESSAGE DISPATCHER
// ─────────────────────────────────────────────

function handleMessage(client: Client, msg: C2SMessage): void {
  switch (msg.type) {
    case "SET_USERNAME":
      return handleSetUsername(client, msg.username);

    case "LIST_ROOMS":
      return handleListRooms(client);

    case "JOIN_ROOM":
      return handleJoinRoom(client, msg.roomId);

    case "LEAVE_ROOM":
      return handleLeaveRoom(client, msg.roomId);

    case "SEND_MESSAGE":
      return handleSendMessage(client, msg.roomId, msg.text);

    case "TYPING":
      return handleTyping(client, msg.roomId, msg.isTyping);

    default: {
      // TypeScript will warn if you forget to handle a C2SMessage variant
      const _never: never = msg;
      send(client.ws, error("UNKNOWN_TYPE", `Unknown type`));
    }
  }
}

// ─────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────

function handleSetUsername(client: Client, username: string): void {
  if (!username || username.trim().length < 2) {
    send(client.ws, error("INVALID_USERNAME", "Username must be at least 2 characters"));
    return;
  }

  const taken = [...clients.values()].some(
    (c) => c.username?.toLowerCase() === username.toLowerCase() && c.id !== client.id
  );
  if (taken) {
    send(client.ws, error("USERNAME_TAKEN", `"${username}" is already taken`));
    return;
  }

  client.username = username.trim();
  send(client.ws, {
    type: "USERNAME_SET",
    username: client.username,
    timestamp: Date.now(),
  });

  log("username", `${client.id} → "${client.username}"`);
}

function handleListRooms(client: Client): void {
  send(client.ws, {
    type: "ROOM_LIST",
    rooms: [...rooms.values()].map((r) => ({
      id: r.id,
      name: r.name,
      memberCount: r.members.size,
    })),
    timestamp: Date.now(),
  });
}

function handleJoinRoom(client: Client, roomId: string): void {
  if (!client.username) {
    send(client.ws, error("NO_USERNAME", "Set a username first"));
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    send(client.ws, error("ROOM_NOT_FOUND", `Room "${roomId}" does not exist`));
    return;
  }

  if (client.rooms.has(roomId)) return; // already in room

  room.members.add(client.id);
  client.rooms.add(roomId);

  // Tell the joiner about the room and its current members
  const memberNames = [...room.members]
    .map((id) => clients.get(id)?.username ?? "?")
    .filter(Boolean);

  send(client.ws, {
    type: "ROOM_JOINED",
    roomId,
    roomName: room.name,
    members: memberNames,
    timestamp: Date.now(),
  });

  // Tell existing room members someone joined
  broadcastToRoom(roomId, {
    type: "USER_JOINED",
    roomId,
    username: client.username,
    timestamp: Date.now(),
  }, client.id);

  log("join", `${client.username} → #${room.name}`);
}

function handleLeaveRoom(client: Client, roomId: string): void {
  leaveRoom(client, roomId);
}

function leaveRoom(client: Client, roomId: string): void {
  const room = rooms.get(roomId);
  if (!room || !client.rooms.has(roomId)) return;

  room.members.delete(client.id);
  client.rooms.delete(roomId);

  if (client.username) {
    broadcastToRoom(roomId, {
      type: "USER_LEFT",
      roomId,
      username: client.username,
      timestamp: Date.now(),
    });
  }

  send(client.ws, { type: "ROOM_LEFT", roomId, timestamp: Date.now() });
}

function handleSendMessage(client: Client, roomId: string, text: string): void {
  if (!client.username) {
    send(client.ws, error("NO_USERNAME", "Set a username first"));
    return;
  }
  if (!client.rooms.has(roomId)) {
    send(client.ws, error("NOT_IN_ROOM", `You are not in room "${roomId}"`));
    return;
  }
  if (!text || text.trim().length === 0 || text.length > 500) {
    send(client.ws, error("INVALID_MESSAGE", "Message must be 1–500 characters"));
    return;
  }

  const chatMsg: S2CMessage = {
    type: "CHAT_MESSAGE",
    messageId: randomUUID(),
    roomId,
    senderId: client.id,
    senderName: client.username,
    text: text.trim(),
    timestamp: Date.now(),
  };

  // Broadcast to ALL room members including sender
  broadcastToRoom(roomId, chatMsg);
  log("message", `${client.username} in #${roomId}: "${text.slice(0, 40)}"`);
}

function handleTyping(client: Client, roomId: string, isTyping: boolean): void {
  if (!client.username || !client.rooms.has(roomId)) return;

  broadcastToRoom(
    roomId,
    {
      type: "TYPING",
      roomId,
      username: client.username,
      isTyping,
      timestamp: Date.now(),
    },
    client.id // don't send typing indicator back to the typer
  );
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function send(ws: WebSocket, msg: S2CMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToRoom(
  roomId: string,
  msg: S2CMessage,
  excludeClientId?: string
): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const payload = JSON.stringify(msg);
  room.members.forEach((clientId) => {
    if (clientId === excludeClientId) return;
    const client = clients.get(clientId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  });
}

function error(code: string, message: string): S2CMessage {
  return { type: "ERROR", code, message, timestamp: Date.now() };
}

function log(event: string, detail: string): void {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[${time}] ${event.toUpperCase().padEnd(12)} ${detail}`);
}

// ─────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────

function shutdown(): void {
  console.log("\nShutting down...");
  wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
