/**
 * PHASE 3: TypeScript WebSocket Client
 *
 * This file would run in the browser (or be bundled with webpack/vite).
 * It uses the NATIVE browser WebSocket API — no libraries needed!
 *
 * The native WebSocket API is the same in all modern browsers.
 * Socket.IO wraps this, but understanding the raw API is essential.
 *
 * Key browser WebSocket API:
 *   const ws = new WebSocket("ws://host:port");
 *   ws.onopen    = () => {}           // connection established
 *   ws.onmessage = (event) => {}      // message received
 *   ws.onclose   = (event) => {}      // connection closed
 *   ws.onerror   = (event) => {}      // error occurred
 *   ws.send(data)                     // send text or binary
 *   ws.close(code?, reason?)          // close the connection
 *   ws.readyState                     // CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3
 */

// ─────────────────────────────────────────────
// TYPES (same protocol as the server)
// ─────────────────────────────────────────────

type ServerMessage =
  | { type: "WELCOME"; clientId: string; message: string; timestamp: number }
  | { type: "USERNAME_SET"; username: string; message: string }
  | { type: "MESSAGE"; senderId: string; username: string; text: string; timestamp: number }
  | { type: "USER_JOINED"; username: string; timestamp: number }
  | { type: "USER_LEFT"; username: string; timestamp: number }
  | { type: "PONG"; timestamp: number }
  | { type: "ERROR"; code?: string; message: string };

type ClientMessage =
  | { type: "SET_USERNAME"; username: string }
  | { type: "SEND_MESSAGE"; text: string }
  | { type: "PING" };

// ─────────────────────────────────────────────
// THE CHAT CLIENT CLASS
// Wraps the raw WebSocket with a clean, typed interface
// ─────────────────────────────────────────────

class ChatClient {
  private ws: WebSocket | null = null;
  private username: string | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Event callbacks — the UI layer will set these
  onMessage: ((msg: ServerMessage) => void) | null = null;
  onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor(private readonly url: string) {}

  // ─────────────────────────────────────────────
  // CONNECT
  // ─────────────────────────────────────────────

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    console.log(`Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    // ── onopen ──────────────────────────────────
    // The HTTP Upgrade handshake is complete; the persistent socket is ready
    this.ws.onopen = () => {
      console.log("Connected!");
      this.reconnectAttempts = 0;
      this.onConnectionChange?.(true);
    };

    // ── onmessage ───────────────────────────────
    // A text or binary frame arrived from the server.
    // event.data is a string (for text frames) or Blob/ArrayBuffer (binary).
    this.ws.onmessage = (event: MessageEvent) => {
      const msg = this.parse(event.data);
      if (msg) {
        this.onMessage?.(msg);
      }
    };

    // ── onclose ─────────────────────────────────
    // Fired when the connection ends (clean or unclean).
    // CloseEvent.code:
    //   1000 = Normal Closure    (we called ws.close())
    //   1001 = Going Away        (browser navigating)
    //   1006 = Abnormal Closure  (no close frame; network drop)
    //   1011 = Internal Error    (server error)
    this.ws.onclose = (event: CloseEvent) => {
      console.log(`Disconnected: code=${event.code}, reason="${event.reason}"`);
      this.onConnectionChange?.(false);
      this.ws = null;

      // Auto-reconnect for abnormal closures (network issues)
      if (event.code !== 1000 && event.code !== 1001) {
        this.scheduleReconnect();
      }
    };

    // ── onerror ─────────────────────────────────
    // Note: onerror always fires before onclose on connection failure.
    // The ErrorEvent in the browser is intentionally vague for security.
    this.ws.onerror = (event: Event) => {
      console.error("WebSocket error:", event);
      // Don't try to reconnect here; onclose will always fire after onerror
    };
  }

  // ─────────────────────────────────────────────
  // EXPONENTIAL BACKOFF RECONNECTION
  // Each failed attempt waits longer: 1s, 2s, 4s, 8s, 16s
  // This prevents thundering herd when a server restarts
  // ─────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      console.error("Max reconnection attempts reached. Giving up.");
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // 1s, 2s, 4s...
    this.reconnectAttempts++;
    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT})...`
    );

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // ─────────────────────────────────────────────
  // SEND HELPERS — typed so you can't send wrong messages
  // ─────────────────────────────────────────────

  setUsername(username: string): void {
    this.username = username;
    this.send({ type: "SET_USERNAME", username });
  }

  sendMessage(text: string): void {
    if (!this.username) {
      console.warn("Set a username first");
      return;
    }
    this.send({ type: "SEND_MESSAGE", text });
  }

  ping(): void {
    this.send({ type: "PING" });
  }

  // ─────────────────────────────────────────────
  // CLOSE — always close with code 1000 for clean shutdown
  // ─────────────────────────────────────────────

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, "User disconnected");
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn("Cannot send: not connected");
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private parse(raw: string): ServerMessage | null {
    try {
      return JSON.parse(raw) as ServerMessage;
    } catch {
      console.error("Invalid JSON from server:", raw);
      return null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

// ─────────────────────────────────────────────
// USAGE EXAMPLE (in a browser context)
// ─────────────────────────────────────────────

function bootstrapChat(): void {
  const client = new ChatClient("ws://localhost:8080");

  // Wire up UI callbacks
  client.onConnectionChange = (connected) => {
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = connected ? "Connected" : "Disconnected";
      statusEl.style.color = connected ? "green" : "red";
    }
  };

  client.onMessage = (msg) => {
    switch (msg.type) {
      case "WELCOME":
        console.log("Server welcomed us:", msg.message);
        break;

      case "USERNAME_SET":
        console.log(`Username set! ${msg.message}`);
        // Show the chat area, hide the login form
        break;

      case "MESSAGE":
        // msg.username, msg.text, msg.timestamp are all typed
        appendMessage(msg.username, msg.text, new Date(msg.timestamp));
        break;

      case "USER_JOINED":
        appendSystemMessage(`${msg.username} joined the chat`);
        break;

      case "USER_LEFT":
        appendSystemMessage(`${msg.username} left the chat`);
        break;

      case "ERROR":
        console.error(`Server error [${msg.code ?? "?"}]: ${msg.message}`);
        break;
    }
  };

  client.connect();

  // Expose to browser console for manual testing
  (window as unknown as Record<string, unknown>).chatClient = client;
}

function appendMessage(username: string, text: string, time: Date): void {
  const el = document.createElement("div");
  el.textContent = `[${time.toLocaleTimeString()}] ${username}: ${text}`;
  document.getElementById("messages")?.appendChild(el);
}

function appendSystemMessage(text: string): void {
  const el = document.createElement("div");
  el.style.fontStyle = "italic";
  el.style.color = "#666";
  el.textContent = `--- ${text} ---`;
  document.getElementById("messages")?.appendChild(el);
}

// In a real browser bundle, you'd call this on DOMContentLoaded
// bootstrapChat();

export { ChatClient };
export type { ServerMessage, ClientMessage };

console.log("Phase 3 module loaded. Key concepts:");
console.log("  ✓ Native WebSocket API (no library)");
console.log("  ✓ onopen / onmessage / onclose / onerror events");
console.log("  ✓ CloseEvent codes (1000, 1001, 1006, 1011)");
console.log("  ✓ Exponential backoff auto-reconnection");
console.log("  ✓ Typed send helpers prevent protocol mistakes");
console.log("  ✓ readyState (CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3)");
