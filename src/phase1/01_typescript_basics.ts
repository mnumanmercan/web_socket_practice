/**
 * PHASE 1 - LESSON 1: TypeScript Basics for Messaging Apps
 *
 * This file teaches you the TypeScript concepts you'll actually USE
 * when building a messaging system. Run with:
 *   npx ts-node src/phase1/01_typescript_basics.ts
 */

// ─────────────────────────────────────────────
// 1. TYPES vs INTERFACES
//    Types and interfaces both describe the shape of objects.
//    In messaging apps, you'll use them to define what a "message" looks like.
// ─────────────────────────────────────────────

// A "type alias" - great for unions and simple shapes
type MessageStatus = "sent" | "delivered" | "read" | "failed";
//   ^ This is a UNION TYPE: the value can only be one of these strings.
//   TypeScript will catch a typo like "Sent" at compile time, not runtime!

// An "interface" - great for objects that will be extended
interface User {
  id: string;
  username: string;
  isOnline: boolean;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  status: MessageStatus; // reusing our union type above
}

// ─────────────────────────────────────────────
// 2. GENERICS
//    Generics let you write flexible, reusable code without losing type safety.
//    In WebSocket messaging, every event needs a "payload" — generics describe it.
// ─────────────────────────────────────────────

// A generic "envelope" that wraps any event payload.
// T is a placeholder for the actual payload type.
interface WebSocketEvent<T> {
  type: string;
  payload: T;
  timestamp: number;
}

// Usage: now TypeScript knows exactly what's inside each event
type SendMessageEvent = WebSocketEvent<{ text: string; roomId: string }>;
type UserJoinEvent = WebSocketEvent<{ username: string }>;

// ─────────────────────────────────────────────
// 3. DISCRIMINATED UNIONS — The backbone of message protocols
//    This is the MOST important pattern for WebSocket messaging.
//    Every message type has a unique "type" field that TypeScript can
//    use to narrow down exactly which variant you're dealing with.
// ─────────────────────────────────────────────

// Define every possible message the client can SEND to the server
type ClientMessage =
  | { type: "SET_USERNAME"; username: string }
  | { type: "SEND_MESSAGE"; text: string; roomId: string }
  | { type: "JOIN_ROOM"; roomId: string }
  | { type: "LEAVE_ROOM"; roomId: string }
  | { type: "TYPING_START" }
  | { type: "TYPING_STOP" };

// Define every possible message the server can SEND to the client
type ServerMessage =
  | { type: "WELCOME"; userId: string; message: string }
  | { type: "MESSAGE_RECEIVED"; message: Message; roomId: string }
  | { type: "USER_JOINED"; user: User; roomId: string }
  | { type: "USER_LEFT"; userId: string; username: string; roomId: string }
  | { type: "USER_TYPING"; username: string }
  | { type: "ERROR"; code: string; message: string }
  | { type: "ROOM_LIST"; rooms: Room[] };

interface Room {
  id: string;
  name: string;
  memberCount: number;
}

// ─────────────────────────────────────────────
// 4. HANDLING MESSAGES WITH TYPE NARROWING
//    TypeScript's "switch" on a discriminated union gives you
//    auto-complete and catches missing cases at compile time.
// ─────────────────────────────────────────────

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "WELCOME":
      // TypeScript KNOWS msg.userId and msg.message exist here
      console.log(`Connected! Your user ID is: ${msg.userId}`);
      console.log(msg.message);
      break;

    case "MESSAGE_RECEIVED":
      // TypeScript KNOWS msg.message and msg.roomId exist here
      console.log(`[${msg.roomId}] ${msg.message.senderId}: ${msg.message.text}`);
      break;

    case "USER_JOINED":
      // TypeScript KNOWS msg.user and msg.roomId exist here
      console.log(`${msg.user.username} joined room ${msg.roomId}`);
      break;

    case "USER_LEFT":
      console.log(`${msg.username} left room ${msg.roomId}`);
      break;

    case "USER_TYPING":
      console.log(`${msg.username} is typing...`);
      break;

    case "ROOM_LIST":
      console.log(`Available rooms:`, msg.rooms.map((r) => r.name).join(", "));
      break;

    case "ERROR":
      console.error(`Error ${msg.code}: ${msg.message}`);
      break;

    default:
      // This pattern ensures you handle every case.
      // If you add a new type to ServerMessage and forget to handle it,
      // TypeScript will show an error here.
      const _exhaustive: never = msg;
      console.log("Unhandled message type", _exhaustive);
  }
}

// ─────────────────────────────────────────────
// 5. SERIALIZATION: JSON in, typed objects out
//    WebSockets send raw text (JSON strings). You must parse them safely.
// ─────────────────────────────────────────────

function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    // Type guard: check the structure before trusting it
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof (parsed as Record<string, unknown>).type === "string"
    ) {
      return parsed as ServerMessage;
    }
    return null;
  } catch {
    console.error("Failed to parse message:", raw);
    return null;
  }
}

// ─────────────────────────────────────────────
// DEMO: Run this file to see it all work
// ─────────────────────────────────────────────

const exampleRaw = JSON.stringify({
  type: "MESSAGE_RECEIVED",
  roomId: "general",
  message: {
    id: "msg-1",
    senderId: "user-42",
    text: "Hello from TypeScript!",
    timestamp: new Date(),
    status: "delivered",
  },
} satisfies ServerMessage); // "satisfies" checks type without widening it

const parsed = parseServerMessage(exampleRaw);
if (parsed) {
  handleServerMessage(parsed);
}

console.log("\nKey TypeScript concepts covered:");
console.log("  ✓ Union types (MessageStatus)");
console.log("  ✓ Interfaces (User, Message, Room)");
console.log("  ✓ Generics (WebSocketEvent<T>)");
console.log("  ✓ Discriminated unions (ClientMessage, ServerMessage)");
console.log("  ✓ Type narrowing in switch/case");
console.log("  ✓ Safe JSON parsing with type guards");
