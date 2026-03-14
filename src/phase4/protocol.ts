/**
 * PHASE 4: Shared Protocol — used by both server.ts and client HTML
 * This is the "contract" between client and server.
 */

export interface BaseMessage {
  type: string;
  timestamp: number;
}

// ── Client → Server ───────────────────────────────────────

export type C2SMessage =
  | { type: "SET_USERNAME"; username: string }
  | { type: "JOIN_ROOM"; roomId: string }
  | { type: "LEAVE_ROOM"; roomId: string }
  | { type: "SEND_MESSAGE"; text: string; roomId: string }
  | { type: "TYPING"; roomId: string; isTyping: boolean }
  | { type: "LIST_ROOMS" };

// ── Server → Client ───────────────────────────────────────

export type S2CMessage =
  | S2C_Welcome
  | S2C_Error
  | S2C_UsernameSet
  | S2C_RoomJoined
  | S2C_RoomLeft
  | S2C_ChatMessage
  | S2C_UserJoined
  | S2C_UserLeft
  | S2C_Typing
  | S2C_RoomList;

export interface S2C_Welcome {
  type: "WELCOME";
  userId: string;
  timestamp: number;
}

export interface S2C_Error {
  type: "ERROR";
  code: string;
  message: string;
  timestamp: number;
}

export interface S2C_UsernameSet {
  type: "USERNAME_SET";
  username: string;
  timestamp: number;
}

export interface S2C_RoomJoined {
  type: "ROOM_JOINED";
  roomId: string;
  roomName: string;
  members: string[];
  timestamp: number;
}

export interface S2C_RoomLeft {
  type: "ROOM_LEFT";
  roomId: string;
  timestamp: number;
}

export interface S2C_ChatMessage {
  type: "CHAT_MESSAGE";
  messageId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface S2C_UserJoined {
  type: "USER_JOINED";
  roomId: string;
  username: string;
  timestamp: number;
}

export interface S2C_UserLeft {
  type: "USER_LEFT";
  roomId: string;
  username: string;
  timestamp: number;
}

export interface S2C_Typing {
  type: "TYPING";
  roomId: string;
  username: string;
  isTyping: boolean;
  timestamp: number;
}

export interface S2C_RoomList {
  type: "ROOM_LIST";
  rooms: Array<{ id: string; name: string; memberCount: number }>;
  timestamp: number;
}
