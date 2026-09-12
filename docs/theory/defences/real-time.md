# Real-time and messaging

WebSockets, SSE and brokers. The family exists because a long-lived connection breaks an
assumption every HTTP guard quietly relies on: **that authorization is decided once per request.**
A socket is authorized once and then lives for hours, during which the role can change, the token
can be revoked, and the messages keep arriving.

One surface here: `GET /observability/events`, Server-Sent Events, `platform.observability.read`
only. SSE rather than WebSocket is itself the design decision most of this page rests on.

## Why SSE, and why that closes half the family

SSE is **one-way**: the server writes, the client never sends. That is not a limitation worked
around, it is the property being bought — a channel with no inbound messages has no message
injection, no per-message authorization, and no message flood to rate-limit. It also rides ordinary
HTTP, so CORS, the origin allowlist and the cookie rules apply unchanged rather than needing a
parallel set for the upgrade handshake.

## Opening the stream

| Attack                         | How it works                                          | This boilerplate                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated upgrade        | the handshake skips the middleware chain              | `requirePermissionViaCookie('platform.observability.read')` verifies the refresh cookie the way `GET /account/refresh` does — signature AND presence on the user document, so a revoked token is rejected — `kernel/middlewares/authorizations.ts#requirePermissionViaCookie` |
| Missing origin check           | any site can open the connection                      | `EventSource` is subject to CORS, and the allowlist is explicit rather than reflected — a foreign origin cannot read the stream — `app/security.ts`                                                                                                                           |
| Cross-site WebSocket hijacking | a cookie-authenticated upgrade with no `Origin` check | No surface: there is no WebSocket upgrade. The CORS answer above is what stands in for it.                                                                                                                                                                                    |
| Unencrypted `ws://`            | plaintext traffic, no `wss://`                        | Not this repo's layer — TLS terminates at the reverse proxy the production compose file requires by binding to loopback — `docker-compose.production.yml`                                                                                                                     |

**Why this one endpoint authenticates by cookie** rather than by the `Authorization: Bearer`
header every other route uses: the browser's `EventSource` cannot set headers. The cookie is
therefore verified more strictly than a bearer token would be — signature _and_ presence on the
user document — rather than less. The reasoning is at
[Security](../../tools/security.md#why-the-sse-endpoints-authenticate-by-cookie).

## What travels on it

| Attack                            | How it works                                                       | This boilerplate                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broadcast leakage                 | room or topic scoping errors fan a message too widely              | The stream carries PROCESS metrics only: request volumes, error rates, latency, uptime, heap. No user data fans out through it — `infrastructure/observability/stream.ts`                   |
| Message injection                 | the server trusts message payloads with no per-type schema         | One-way by construction: the server writes, the client never sends — `stream.ts`                                                                                                            |
| Authorization per message missing | auth checked at connect; later messages target another user's room | Same answer — there are no inbound messages, and the outbound ones are not addressed to a room.                                                                                             |
| Message flood                     | DoS through the socket, with no per-connection limit               | Same answer for inbound. Outbound volume is bounded by the metrics sampling interval, not by the client.                                                                                    |
| Stale connection authorization    | rights revoked, but the socket lives on                            | 🚧 Coming soon — the permission is checked at connect and not re-checked for the life of the stream. The blast radius is bounded by what the stream carries: process metrics, no user data. |

## The broker side

RabbitMQ is the other real-time surface, and it is not reachable from outside — see
[Data layer](data-layer.md#the-broker) for message validation and dead-lettering, and
[Reaching the store](data-layer.md#reaching-the-store) for why no port is published.

## Related

- [Data layer](data-layer.md) — the broker half of this family
- [Authorization](authorization.md) — the permission key this stream demands
- [Information disclosure](disclosure.md#logs-and-telemetry) — what the metrics surface reveals
- [Observability layer](../../tools/observability-layer.md) — what the stream is for
