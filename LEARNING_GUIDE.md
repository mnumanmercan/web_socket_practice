# Learning Guide: TypeScript + WebSocket Messaging App

## What You Already Have vs What You're Building

| Old (JavaScript + Socket.IO) | New (TypeScript + Raw WebSocket) |
|---|---|
| `server.js` — works but no types | `src/phase4/server.ts` — fully typed |
| Socket.IO hides the protocol | Raw `ws` library — you see everything |
| No compile-time safety | TypeScript catches bugs before runtime |
| One global room | Multiple rooms with join/leave |

---

## The Learning Path

### Phase 1 — TypeScript Fundamentals
**Goal:** Learn the TypeScript patterns you'll use in messaging apps.

```bash
npm run phase1:basics     # src/phase1/01_typescript_basics.ts
npm run phase1:protocol   # src/phase1/02_message_protocol.ts
```

**What you'll learn:**
- **Union types** — `type Status = "sent" | "delivered" | "read"`
  - TypeScript enforces valid values at compile time, not runtime
- **Interfaces** — Shape of objects like `User`, `Message`, `Room`
- **Generics** — `WebSocketEvent<T>` — write flexible, reusable wrappers
- **Discriminated unions** — The most important pattern in WebSocket messaging
  ```ts
  type ServerMessage =
    | { type: "WELCOME"; userId: string }
    | { type: "MESSAGE"; text: string; from: string }
    | { type: "ERROR"; code: string }
  ```
  TypeScript knows exactly which fields exist when you `switch` on `type`.
- **Type narrowing** — `switch (msg.type)` gives you full auto-complete per case
- **Exhaustiveness checking** — `const _: never = msg` — TypeScript warns if you forget to handle a new message type

---

### Phase 2 — Raw WebSocket Server
**Goal:** Understand what WebSockets actually are under the hood.

```bash
npm run phase2:server     # src/phase2/websocket_server.ts
# Then in another terminal:
# npm install -g wscat
# wscat -c ws://localhost:8080
```

**What you'll learn:**

#### WebSocket Protocol Basics
```
Client                          Server
  |  --- HTTP GET /chat          |
  |  Upgrade: websocket          |
  |  Sec-WebSocket-Key: ...      |
  |                              |
  |  <-- 101 Switching Protocols |
  |  Sec-WebSocket-Accept: ...   |
  |                              |
  |  === Persistent TCP Socket ===|
  |  --> {"type":"SET_USERNAME"} |
  |  <-- {"type":"WELCOME"}      |
  |  --> {"type":"SEND_MESSAGE"} |
  |  <-- {"type":"MESSAGE"}      |
```

#### Key Events (server-side, `ws` library)
```ts
wss.on('connection', (ws, request) => { /* new client */ });
ws.on('message', (data, isBinary) => { /* data arrived */ });
ws.on('close', (code, reason) => { /* client left */ });
ws.on('error', (err) => { /* handle errors or Node crashes */ });
ws.on('pong', () => { /* heartbeat response received */ });
```

#### WebSocket Close Codes
| Code | Meaning |
|------|---------|
| 1000 | Normal closure (you called `ws.close()`) |
| 1001 | Going away (browser navigating away) |
| 1006 | Abnormal closure (network dropped, no close frame) |
| 1011 | Server internal error |

#### Heartbeat (Ping/Pong)
Browsers don't always send a close frame when a tab is killed.
You need to periodically send a `ping` and close any socket that doesn't respond:
```ts
setInterval(() => {
  wss.clients.forEach(ws => ws.ping());
}, 30_000);
```

---

### Phase 3 — Browser WebSocket Client
**Goal:** Use the native browser WebSocket API with TypeScript types.

File: `src/phase3/websocket_client.ts`
(Browser-only file — compile with `src/phase3/tsconfig.browser.json`)

**What you'll learn:**

#### Native Browser WebSocket API
```ts
const ws = new WebSocket("ws://localhost:8080");

ws.onopen    = () => { /* connected, can now send */ };
ws.onmessage = (event) => { JSON.parse(event.data); };
ws.onclose   = (event) => { /* event.code, event.reason */ };
ws.onerror   = (event) => { /* always followed by onclose */ };

ws.send(JSON.stringify({ type: "PING" }));
ws.close(1000, "Done");

// readyState values:
ws.readyState === WebSocket.CONNECTING  // 0 — not yet open
ws.readyState === WebSocket.OPEN        // 1 — ready to use
ws.readyState === WebSocket.CLOSING     // 2 — close in progress
ws.readyState === WebSocket.CLOSED      // 3 — fully closed
```

#### Exponential Backoff Reconnection
Don't hammer the server on reconnect — wait longer each attempt:
```
Attempt 1: wait 1s
Attempt 2: wait 2s
Attempt 3: wait 4s
Attempt 4: wait 8s
Attempt 5: give up
```

---

### Phase 4 — Full Chat App with Rooms
**Goal:** Put it all together in a production-like architecture.

```bash
npm run phase4:server     # src/phase4/server.ts
# Open http://localhost:8081 in two browser tabs
```

**New concepts:**

#### Room Pattern (Pub/Sub Fan-out)
```
          ┌─────────────────────────────┐
          │   Server State              │
          │   rooms: Map<id, Room>      │
          │   clients: Map<id, Client>  │
          └─────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    #general         #random        #tech
    [Alice, Bob]     [Carol]       [Alice]
```

When Alice sends a message to `#general`, the server:
1. Looks up the room by `roomId`
2. Iterates over `room.members` (a `Set<string>` of client IDs)
3. For each member, looks up their WebSocket and sends the message

#### Typed Protocol Contract (`protocol.ts`)
Both the server and the browser HTML share the same type definitions.
This is the "contract" — if the server sends a `CHAT_MESSAGE`, the client knows
exactly what fields to expect.

#### Graceful Shutdown
```ts
process.on('SIGINT', () => {
  wss.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
  httpServer.close(() => process.exit(0));
});
```
This sends a proper close frame to all clients before the process exits.

---

## Architecture Diagram

```
Browser Tab 1                    Node.js Server              Browser Tab 2
─────────────                    ──────────────              ─────────────
new WebSocket(url)
    │ HTTP Upgrade
    │────────────────────────────►│
    │◄──────────────────────────── 101 Switching Protocols
    │                             │
    │── SET_USERNAME "Alice" ─────►│ clients.set(id, {...})
    │◄── USERNAME_SET ─────────────│
    │                             │                          new WebSocket(url)
    │                             │◄──────────────────────── HTTP Upgrade
    │                             │─────────────────────────►101
    │                             │◄──────────────────────── SET_USERNAME "Bob"
    │                             │─────────────────────────►USERNAME_SET
    │── JOIN_ROOM "general" ──────►│ rooms.get("general")
    │◄── ROOM_JOINED ──────────────│   .members.add(aliceId)
    │                             │◄──────────────────────── JOIN_ROOM "general"
    │◄── USER_JOINED "Bob" ────────│─────────────────────────►ROOM_JOINED
    │                             │
    │── SEND_MESSAGE "Hello!" ────►│ broadcastToRoom("general", msg)
    │◄── CHAT_MESSAGE ─────────────│─────────────────────────►CHAT_MESSAGE
```

---

## Key Concepts Summary

| Concept | Where to See It |
|---------|----------------|
| TypeScript union types | `phase1/01_typescript_basics.ts:11` |
| Discriminated unions | `phase1/01_typescript_basics.ts:50` |
| Type narrowing in switch | `phase1/01_typescript_basics.ts:68` |
| Exhaustiveness check | `phase1/01_typescript_basics.ts:117` |
| Typed message protocol | `phase1/02_message_protocol.ts` |
| WebSocket server events | `phase2/websocket_server.ts:62` |
| Heartbeat / ping-pong | `phase2/websocket_server.ts:116` |
| Close codes | `phase2/websocket_server.ts:90` |
| Native browser WS API | `phase3/websocket_client.ts:76` |
| Exponential backoff | `phase3/websocket_client.ts:103` |
| readyState constants | `phase3/websocket_client.ts:164` |
| Room fan-out | `phase4/server.ts:150` |
| Graceful shutdown | `phase4/server.ts:211` |

---

## What's Next (Beyond This Project)

Once you're comfortable with Phase 4, here are natural next steps:

1. **Message persistence** — Store messages in PostgreSQL/SQLite so they survive server restarts
2. **Authentication** — Validate a JWT token in the WebSocket upgrade request header
3. **Private messages** — Add a `DIRECT_MESSAGE` type that routes to a single client by ID
4. **Read receipts** — Track which clients have received/seen each message ID
5. **Binary messages** — Send file/image data as binary frames instead of base64 JSON
6. **Horizontal scaling** — Use Redis Pub/Sub so multiple Node.js servers can share room state
7. **Rate limiting** — Prevent message spam by tracking messages-per-second per client
