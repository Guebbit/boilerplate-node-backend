# Real-time and messaging

WebSockets, SSE and brokers. The family exists because a long-lived connection breaks an
assumption every HTTP guard quietly relies on: **that authorization is decided once per request.**
A socket is authorized once and then lives for hours, during which the role can change, the token
can be revoked, and the messages keep arriving.

Two surfaces here, both Server-Sent Events: `GET /observability/events`
(`read:ObservabilitySnapshot` only) and `GET /notifications/stream` (`read:Notification`,
each frame routed to the one user it is about). SSE rather than WebSocket is itself the design
decision most of this page rests on.

## Why SSE, and why that closes half the family

SSE is **one-way**: the server writes, the client never sends. That is not a limitation worked
around, it is the property being bought — a channel with no inbound messages has no message
injection, no per-message authorization, and no message flood to rate-limit. It also rides ordinary
HTTP, so CORS, the origin allowlist and the cookie rules apply unchanged rather than needing a
parallel set for the upgrade handshake.

## Opening the stream

| Attack                         | How it works                                          | This boilerplate                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated upgrade        | the handshake skips the middleware chain              | `requirePermissionViaCookie(key)` (each stream's own key) verifies the refresh cookie the way `POST /account/refresh` does, after refusing a foreign `Origin` — signature AND presence on the user document, so a revoked token is rejected — `kernel/middlewares/authorizations.ts#requirePermissionViaCookie` |
| Missing origin check           | any site can open the connection                      | `EventSource` is subject to CORS, and the allowlist is explicit rather than reflected — a foreign origin cannot read the stream — `app/security.ts`                                                                                                                                                             |
| Cross-site WebSocket hijacking | a cookie-authenticated upgrade with no `Origin` check | No surface: there is no WebSocket upgrade. The CORS answer above is what stands in for it.                                                                                                                                                                                                                      |
| Unencrypted `ws://`            | plaintext traffic, no `wss://`                        | Not this repo's layer — TLS terminates at the reverse proxy the production compose file requires by binding to loopback — `docker-compose.production.yml`                                                                                                                                                       |

**Why this one endpoint authenticates by cookie** rather than by the `Authorization: Bearer`
header every other route uses: the browser's `EventSource` cannot set headers. The cookie is
therefore verified more strictly than a bearer token would be — signature _and_ presence on the
user document — rather than less. The reasoning is at
[Security](../../tools/security.md#why-the-sse-endpoints-authenticate-by-cookie).

## What travels on it

| Attack                            | How it works                                                       | This boilerplate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broadcast leakage                 | room or topic scoping errors fan a message too widely              | The observability stream carries PROCESS metrics only: request volumes, error rates, latency, uptime, heap — no user data — `modules/observability/services/stream.ts`. The notifications stream does carry user data, so it never broadcasts: connections are held in a map keyed by user id and a frame is written only to the connections of the user it is about — `modules/notifications/services/stream.ts#publishToUser`                                                                                                                             |
| Message injection                 | the server trusts message payloads with no per-type schema         | One-way by construction: the server writes, the client never sends — `stream.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Authorization per message missing | auth checked at connect; later messages target another user's room | Same answer — there are no inbound messages, and the outbound ones are not addressed to a room.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Message flood                     | DoS through the socket, with no per-connection limit               | Same answer for inbound. Outbound volume is bounded by the metrics sampling interval, not by the client.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Stale connection authorization    | rights revoked, but the socket lives on                            | Re-checked every 30 seconds; the stream closes on the first failed check. The check follows the session's family, not the cookie that opened the stream, so a refresh rotation keeps the stream open and a logout closes it. The recheck timer lives once, in `infrastructure/http/sse.ts#openSseStream`. Same verdict as connecting — `kernel/middlewares/authorizations.ts#stillHoldsKeyViaCookie`, called from `modules/observability/services/stream.ts#streamObservabilityMetrics` and `modules/notifications/controllers/get-notifications-stream.ts` |

## The broker side

RabbitMQ is the other real-time surface, and it is not reachable from outside — see
[Data layer](data-layer.md#the-broker) for message validation and dead-lettering, and
[Reaching the store](data-layer.md#reaching-the-store) for why no port is published.

## Related

- [Data layer](data-layer.md) — the broker half of this family
- [Authorization](authorization.md) — the permission rule this stream demands
- [Information disclosure](disclosure.md#logs-and-telemetry) — what the metrics surface reveals
- [Observability layer](../../tools/observability-layer.md) — what the stream is for
