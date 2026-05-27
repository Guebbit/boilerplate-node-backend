# WebSockets

The boilerplate exposes a tiny WebSocket example so the same Node process can serve both REST and real-time traffic.
It is **opt-in** scaffolding, not a production messaging stack.

## Where the code lives

| Concern                  | File                              |
| ------------------------ | --------------------------------- |
| Server setup + lifecycle | `src/utils/helpers-websockets.ts` |
| Chat lifecycle + state   | `src/utils/realtime-chat.ts`      |
| Event contracts          | `src/utils/realtime-contracts.ts` |
| Upgrade handler          | `src/routes/websocket.ts`         |

The implementation is built on the [`ws`](https://github.com/websockets/ws) library — the same one most Node WebSocket frameworks build on top of.

## Lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant H as HTTP server (Express)
    participant W as WebSocketServer (`ws`)
    C->>H: HTTP Upgrade request
    H->>W: handle upgrade
    W-->>C: 101 Switching Protocols
    loop while open
        C->>W: message
        W->>W: onMessage handler
        W-->>C: response / broadcast
    end
    C->>W: close
    W->>W: onClose handler
```

`setupWebSocketServer` accepts `connectionCallback`, `onMessage`, and `onClose` so the route file only describes what it wants to happen at each step.

## Chat example contract (`/ws/chat`)

Client -> server events:

- `chat:join` `{ username, room?: "general" }`
- `chat:message:send` `{ message }`

Server -> client events:

- `chat:joined` `{ username, room }`
- `chat:message` `{ id, username, room, message, timestamp }`
- `chat:presence` `{ room, users }`
- `chat:system` `{ message, room, timestamp }`
- `chat:error` `{ message }`

The room is in-memory only and defaults to `general`.

## Production notes

- **Clustering**: WebSocket connections are sticky to the worker that accepted them. If you run with `NODE_ENABLE_CLUSTERING=1` you need a sticky-session reverse proxy (NGINX, HAProxy, Envoy) or a pub/sub backplane (Redis pub/sub, NATS, …) to fan out messages between workers.
- **Auth**: the demo skips authentication. In real use, validate cookies/JWT during the HTTP upgrade.
- **Backpressure**: check `client.readyState === WebSocket.OPEN` before sending (the demo does this) and consider `bufferedAmount` for high-throughput streams.

## Useful links

- [`ws` documentation](https://github.com/websockets/ws#readme)
- [`ws` API reference](https://github.com/websockets/ws/blob/master/doc/ws.md)
- [MDN — WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [RFC 6455 — The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
- [Scaling WebSockets with Redis pub/sub](https://redis.io/docs/latest/develop/interact/pubsub/)

## Related pages

- [Runtime](./runtime.md)
- [Clustering & graceful shutdown](../theory/clustering.md)
- [Security](./security.md)
