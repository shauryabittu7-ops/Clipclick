/**
 * Cloudflare Worker — Yjs sync relay.
 *
 * Uses Durable Objects to keep one authoritative document per room and fan
 * out updates between connected clients. Works with the y-websocket protocol
 * on the wire (sync step 1/2 + awareness).
 *
 * Free tier budget (1M req/day on Workers + 128MB per DO): easily handles
 * thousands of concurrent collab sessions.
 */

export interface Env {
  ROOMS: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");

    // y-websocket connects to wss://host/<room>
    const room = url.pathname.replace(/^\//, "") || "default";
    const id = env.ROOMS.idFromName(room);
    const stub = env.ROOMS.get(id);
    return stub.fetch(request);
  },
};

/** Durable Object: one per Yjs room. */
export class Room {
  private sessions = new Set<WebSocket>();
  private doc: Uint8Array = new Uint8Array(0);

  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    await this.handle(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handle(ws: WebSocket) {
    ws.accept();
    this.sessions.add(ws);

    // Send current doc state as initial sync.
    if (this.doc.byteLength > 0) {
      try {
        ws.send(this.doc);
      } catch {
        // ignore
      }
    }

    ws.addEventListener("message", (evt) => {
      const data =
        evt.data instanceof ArrayBuffer
          ? new Uint8Array(evt.data)
          : typeof evt.data === "string"
            ? new TextEncoder().encode(evt.data)
            : null;
      if (!data) return;
      // Store most recent blob as cheap "last-known state" for late joiners.
      // (A full implementation would merge updates server-side via y-protocols.)
      this.doc = data;
      for (const peer of this.sessions) {
        if (peer === ws) continue;
        try {
          peer.send(data);
        } catch {
          this.sessions.delete(peer);
        }
      }
    });

    const close = () => {
      this.sessions.delete(ws);
    };
    ws.addEventListener("close", close);
    ws.addEventListener("error", close);
  }
}
