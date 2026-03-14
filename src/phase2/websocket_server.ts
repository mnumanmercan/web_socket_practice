/**
 * PHASE 2: Raw WebSocket Server (no Socket.IO!)
 *
 * This teaches you what WebSockets really are under the hood.
 * Socket.IO is great, but it hides the protocol. Here we use
 * the raw "ws" library which is a thin wrapper over the WebSocket spec.
 *
 * WebSocket lifecycle:
 *   1. Client sends HTTP "Upgrade" request
 *   2. Server upgrades the connection to a persistent TCP socket
 *   3. Both sides can now send frames (text, binary, ping/pong) anytime
 *   4. Either side can close with an optional reason code
 *
 * Run with:  npx ts-node src/phase2/websocket_server.ts
 * Test with: wscat -c ws://localhost:8080   (npm install -g wscat)
 */

import WebSocket, { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────
// TYPES: Each connected client gets this shape
// ─────────────────────────────────────────────

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  username: string | null;
  connectedAt: Date;
}

// ─────────────────────────────────────────────
// STATE: In-memory store of all live connections
// In production you'd use Redis for multi-server setups
// ─────────────────────────────────────────────

const clients = new Map<string, ConnectedClient>();

// ─────────────────────────────────────────────
// SERVER SETUP
// ─────────────────────────────────────────────

const PORT = 8080;

const wss = new WebSocketServer({
  port: PORT,
  // perMessageDeflate compresses messages — useful for large text payloads
  perMessageDeflate: {
    threshold: 1024, // only compress messages > 1KB
  },
});

console.log(`WebSocket server listening on ws://localhost:${PORT}`);

// ─────────────────────────────────────────────
// CONNECTION EVENT
// Fires every time a new client connects
// ─────────────────────────────────────────────

wss.on("connection", (ws: WebSocket, request) => {
  const clientId = randomUUID();
  const client: ConnectedClient = {
    id: clientId,
    ws,
    username: null,
    connectedAt: new Date(),
  };

  clients.set(clientId, client);
  console.log(`[+] Client connected: ${clientId} (total: ${clients.size})`);
  console.log(`    Origin: ${request.headers.origin ?? "unknown"}`);

  // Send the client their ID immediately on connect
  sendToClient(ws, {
    type: "WELCOME",
    clientId,
    message: "Connected to WebSocket server",
    timestamp: Date.now(),
  });

  // ─────────────────────────────────────────────
  // MESSAGE EVENT
  // Fires when a message frame arrives from this client
  // ─────────────────────────────────────────────
  ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
    if (isBinary) {
      // Binary frames could be used for file transfers, audio, etc.
      console.log(`Received binary frame (${(data as Buffer).length} bytes)`);
      return;
    }

    const raw = data.toString();
    console.log(`[→] Received from ${clientId}: ${raw}`);

    handleMessage(client, raw);
  });

  // ─────────────────────────────────────────────
  // CLOSE EVENT
  // Fires when the connection ends (browser tab closed, network drop, etc.)
  // The "code" is a WebSocket close code:
  //   1000 = normal closure
  //   1001 = going away (page navigated)
  //   1006 = abnormal closure (no close frame — e.g. network drop)
  // ─────────────────────────────────────────────
  ws.on("close", (code: number, reason: Buffer) => {
    const username = client.username ?? clientId;
    console.log(
      `[-] Client disconnected: ${username} (code: ${code}, reason: ${reason.toString() || "none"})`
    );

    clients.delete(clientId);

    if (client.username) {
      broadcast(
        {
          type: "USER_LEFT",
          username: client.username,
          timestamp: Date.now(),
        },
        clientId // exclude the disconnected client
      );
    }
  });

  // ─────────────────────────────────────────────
  // ERROR EVENT
  // Always handle errors or Node.js will crash on unhandled errors
  // ─────────────────────────────────────────────
  ws.on("error", (err: Error) => {
    console.error(`[!] Error from client ${clientId}:`, err.message);
  });

  // ─────────────────────────────────────────────
  // PING/PONG — heartbeat mechanism
  // The server sends a ping; the client must respond with pong.
  // If no pong arrives, we know the connection is dead (zombie socket).
  // ─────────────────────────────────────────────
  ws.on("pong", () => {
    console.log(`[♥] Pong from ${clientId}`);
  });
});

// ─────────────────────────────────────────────
// HEARTBEAT: Detect dead connections every 30 seconds
// This is critical — browsers don't always send a close frame
// when a tab is killed or the network drops.
// ─────────────────────────────────────────────

const HEARTBEAT_INTERVAL = 30_000;

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping(); // will trigger the "pong" event above if client is alive
    }
  });
}, HEARTBEAT_INTERVAL);

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────

function handleMessage(client: ConnectedClient, raw: string): void {
  let msg: Record<string, unknown>;

  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendToClient(client.ws, {
      type: "ERROR",
      code: "INVALID_JSON",
      message: "Message must be valid JSON",
    });
    return;
  }

  const type = msg.type;

  switch (type) {
    case "SET_USERNAME": {
      const username = msg.username as string;
      if (!username || typeof username !== "string") {
        sendToClient(client.ws, { type: "ERROR", message: "Username required" });
        return;
      }

      // Check if username is taken
      const taken = [...clients.values()].some(
        (c) => c.username === username && c.id !== client.id
      );
      if (taken) {
        sendToClient(client.ws, {
          type: "ERROR",
          code: "USERNAME_TAKEN",
          message: `"${username}" is already taken`,
        });
        return;
      }

      client.username = username;
      sendToClient(client.ws, {
        type: "USERNAME_SET",
        username,
        message: "Welcome to the chat!",
      });

      // Tell everyone else
      broadcast(
        { type: "USER_JOINED", username, timestamp: Date.now() },
        client.id
      );
      console.log(`    ${client.id} is now known as "${username}"`);
      break;
    }

    case "SEND_MESSAGE": {
      if (!client.username) {
        sendToClient(client.ws, {
          type: "ERROR",
          message: "Set a username first",
        });
        return;
      }

      const text = msg.text as string;
      if (!text || typeof text !== "string" || text.length > 500) {
        sendToClient(client.ws, {
          type: "ERROR",
          message: "Invalid or too-long message",
        });
        return;
      }

      // Broadcast to ALL clients including sender
      const outgoing = {
        type: "MESSAGE",
        senderId: client.id,
        username: client.username,
        text: text.trim(),
        timestamp: Date.now(),
      };
      broadcastAll(outgoing);
      break;
    }

    case "PING": {
      // Application-level ping (different from WebSocket protocol ping)
      sendToClient(client.ws, { type: "PONG", timestamp: Date.now() });
      break;
    }

    default:
      sendToClient(client.ws, {
        type: "ERROR",
        code: "UNKNOWN_TYPE",
        message: `Unknown message type: ${String(type)}`,
      });
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function sendToClient(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Send to all clients EXCEPT the one with excludeId
function broadcast(data: object, excludeId?: string): void {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  });
}

// Send to ALL clients
function broadcastAll(data: object): void {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  });
}

// ─────────────────────────────────────────────
// SERVER ERROR HANDLING
// ─────────────────────────────────────────────

wss.on("error", (err: Error) => {
  console.error("Server error:", err.message);
});

console.log("\nWebSocket concepts in this server:");
console.log("  ✓ WebSocket handshake (HTTP Upgrade)");
console.log("  ✓ connection / message / close / error events");
console.log("  ✓ Text frames (JSON messages)");
console.log("  ✓ Binary frames (mentioned)");
console.log("  ✓ Close codes (1000, 1001, 1006)");
console.log("  ✓ Ping/Pong heartbeat for dead connection detection");
console.log("  ✓ Broadcast helpers");
console.log("\nTo test: npm install -g wscat && wscat -c ws://localhost:8080");
console.log('Then type: {"type":"SET_USERNAME","username":"Alice"}');
console.log('Then type: {"type":"SEND_MESSAGE","text":"Hello world!"}');
