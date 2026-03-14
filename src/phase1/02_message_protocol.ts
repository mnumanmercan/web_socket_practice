/**
 * PHASE 1 - LESSON 2: Message Protocols
 *
 * A "protocol" is an agreed-upon format for how messages are structured.
 * This file defines the SHARED types used by both the server and client.
 * In a real app, you'd put this in a "shared" or "common" package.
 *
 * Run with:  npx ts-node src/phase1/02_message_protocol.ts
 */

// ─────────────────────────────────────────────
// THE CORE CONCEPT: Every WebSocket message is a JSON string.
// Both sides (server + client) need to agree on:
//   1. What "type" field identifies each message kind
//   2. What fields exist for each type
//   3. How to handle unknown/malformed messages
// ─────────────────────────────────────────────

export interface BaseMessage {
  type: string;
  // ISO timestamp string — always include so both sides know when it happened
  timestamp: string;
}

// ─────────────────────────────────────────────
// CLIENT → SERVER messages
// These are commands the user's browser sends to the server
// ─────────────────────────────────────────────

export type C2SMessage =
  | C2S_SetUsername
  | C2S_SendMessage
  | C2S_JoinRoom
  | C2S_LeaveRoom
  | C2S_Typing;

export interface C2S_SetUsername extends BaseMessage {
  type: "C2S_SET_USERNAME";
  username: string;
}

export interface C2S_SendMessage extends BaseMessage {
  type: "C2S_SEND_MESSAGE";
  text: string;
  roomId: string;
}

export interface C2S_JoinRoom extends BaseMessage {
  type: "C2S_JOIN_ROOM";
  roomId: string;
}

export interface C2S_LeaveRoom extends BaseMessage {
  type: "C2S_LEAVE_ROOM";
  roomId: string;
}

export interface C2S_Typing extends BaseMessage {
  type: "C2S_TYPING";
  isTyping: boolean; // true = started, false = stopped
}

// ─────────────────────────────────────────────
// SERVER → CLIENT messages
// These are events the server pushes to connected browsers
// ─────────────────────────────────────────────

export type S2CMessage =
  | S2C_Welcome
  | S2C_MessageReceived
  | S2C_UserJoined
  | S2C_UserLeft
  | S2C_TypingIndicator
  | S2C_RoomList
  | S2C_Error;

export interface S2C_Welcome extends BaseMessage {
  type: "S2C_WELCOME";
  userId: string;
  serverVersion: string;
}

export interface S2C_MessageReceived extends BaseMessage {
  type: "S2C_MESSAGE_RECEIVED";
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  roomId: string;
}

export interface S2C_UserJoined extends BaseMessage {
  type: "S2C_USER_JOINED";
  userId: string;
  username: string;
  roomId: string;
}

export interface S2C_UserLeft extends BaseMessage {
  type: "S2C_USER_LEFT";
  userId: string;
  username: string;
  roomId: string;
}

export interface S2C_TypingIndicator extends BaseMessage {
  type: "S2C_TYPING";
  username: string;
  isTyping: boolean;
  roomId: string;
}

export interface S2C_RoomList extends BaseMessage {
  type: "S2C_ROOM_LIST";
  rooms: Array<{ id: string; name: string; memberCount: number }>;
}

export interface S2C_Error extends BaseMessage {
  type: "S2C_ERROR";
  code: ErrorCode;
  message: string;
}

export type ErrorCode =
  | "USERNAME_TAKEN"
  | "ROOM_NOT_FOUND"
  | "NOT_IN_ROOM"
  | "MESSAGE_TOO_LONG"
  | "INVALID_MESSAGE";

// ─────────────────────────────────────────────
// FACTORY FUNCTIONS — Safely create protocol messages
// These prevent typos and ensure required fields are always set
// ─────────────────────────────────────────────

export function createC2SMessage<T extends C2SMessage>(
  partial: Omit<T, "timestamp">
): T {
  return { ...partial, timestamp: new Date().toISOString() } as T;
}

export function createS2CMessage<T extends S2CMessage>(
  partial: Omit<T, "timestamp">
): T {
  return { ...partial, timestamp: new Date().toISOString() } as T;
}

// ─────────────────────────────────────────────
// PARSING — Safe deserialization with validation
// ─────────────────────────────────────────────

export function parseC2SMessage(raw: string): C2SMessage | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.type !== "string") return null;
    return obj as unknown as C2SMessage;
  } catch {
    return null;
  }
}

export function parseS2CMessage(raw: string): S2CMessage | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.type !== "string") return null;
    return obj as unknown as S2CMessage;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// DEMO
// ─────────────────────────────────────────────

// Create a typed client message
const joinMsg = createC2SMessage<C2S_JoinRoom>({
  type: "C2S_JOIN_ROOM",
  roomId: "general",
});

console.log("Client sends:", JSON.stringify(joinMsg, null, 2));

// Simulate receiving and parsing a server message
const serverRaw = JSON.stringify(
  createS2CMessage<S2C_Welcome>({
    type: "S2C_WELCOME",
    userId: "abc-123",
    serverVersion: "1.0.0",
  })
);

const received = parseS2CMessage(serverRaw);
if (received?.type === "S2C_WELCOME") {
  // TypeScript knows all fields of S2C_Welcome here
  console.log(`\nServer says welcome! Your ID: ${received.userId}`);
  console.log(`Server version: ${received.serverVersion}`);
}

console.log("\nProtocol concepts covered:");
console.log("  ✓ C2S (Client-to-Server) message types");
console.log("  ✓ S2C (Server-to-Client) message types");
console.log("  ✓ BaseMessage with shared timestamp field");
console.log("  ✓ Factory functions for safe message creation");
console.log("  ✓ Safe parsing with runtime validation");
