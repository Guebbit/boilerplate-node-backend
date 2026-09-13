# HTTP, proxies and caches

Attacks that exploit **disagreement between two parsers**, or that abuse a shared cache. Nothing
here is a bug in one program; every row is two programs that each behave correctly and read the
same bytes differently.

Most of this family lives at a layer this repo does not own — one Node process behind whatever
proxy the deployment puts in front. `docker-compose.production.yml` binds the API to loopback
precisely so that a proxy is structurally required, and that proxy's configuration is deliberately
out of scope here. The rows below say which side each control sits on.

## Two parsers disagreeing

| Attack                             | How it works                                                                      | This boilerplate                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP request smuggling             | `CL.TE`, `TE.CL`, `TE.TE`, `CL.0`, `H2.CL` desync hijacks the next user's request | Not this repo's layer — it needs a front end and a back end, and there is one process here. The proxy's normalisation is the deployment's.                                           |
| HTTP desync / connection poisoning | a smuggled prefix poisons a keep-alive connection                                 | Same. `keepAliveTimeout` is exposed (`NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS`) so it can be RAISED above the proxy's idle timeout — `app/security.ts#applyServerTimeouts`                   |
| Request tunnelling                 | a second request hidden inside the first                                          | Same layer.                                                                                                                                                                          |
| WebSocket upgrade smuggling        | the proxy tunnels raw traffic after an upgrade the back end rejects               | No surface: this application speaks SSE, not WebSocket — see [Real-time](real-time.md).                                                                                              |
| Header parsing leniency            | duplicate or malformed `Transfer-Encoding` handled inconsistently                 | Node's own parser is strict by default; this codebase adds no lenient header handling.                                                                                               |
| Reverse-proxy path confusion       | `/api/../admin`, `%2e%2e`, semicolons, Unicode normalised differently             | No guard is a path-prefix rule, so there is no second interpretation to disagree with the router — see [Authorization](authorization.md#bypassing-the-check-rather-than-passing-it). |
| HTTP parameter pollution (HPP)     | `?id=1&id=2` — first wins here, last wins there                                   | Query parameters are parsed against the generated Zod schema, which types each one: a duplicate produces an array where a string is declared, and that is a 422.                     |

## Caches

The cache is the one piece of this family this repo fully owns, because the response cache is
application-level, in Redis.

| Attack                  | How it works                                                                  | This boilerplate                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web cache poisoning     | unkeyed input — a header or a parameter — reflected into a cacheable response | The raw query string is NOT part of the cache key: only the route's declared `keyParameters`, pre-sorted and JSON-serialized, so `?anything=else` cannot mint an entry — `infrastructure/http/middlewares/cache.ts#getCacheKey` |
| Cache-key confusion     | parameter cloaking, fat GET, normalisation differences                        | Same answer — a declared key list has no normalisation ambiguity to exploit.                                                                                                                                                    |
| Web cache deception     | `/account/me.css` confuses the cache into storing a private page              | The cache is keyed by CALLER (`getCacheScope`) and locale, so a private answer cannot be stored under a shared key — `cache.ts#getCacheScope`                                                                                   |
| Cache poisoning by size | an oversized entry evicts everything else, or crashes the store               | An entry over `NODE_REDIS_CACHE_MAX_BYTES` is skipped rather than stored, and only 2xx responses are written at all — `cache.ts#serializeCachedResponse`                                                                        |
| Browser cache poisoning | a cacheable response with injected content persists for the victim            | Nothing reflects request input into a response body — see [Injection](injection.md#into-a-protocol-or-a-document).                                                                                                              |
| Cache stampede          | expiry causes every worker to rebuild the same key at once                    | 🚧 Coming soon — no single-flight or jittered TTL today. The blast radius is bounded by the 1000-row backstop on the queries behind it.                                                                                         |

## Headers and the proxy

| Attack                         | How it works                                                          | This boilerplate                                                                                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted-proxy misconfiguration | `trust proxy` too broad → IP spoofing, HTTPS spoofing                 | `trust proxy` is a HOP COUNT from `NODE_TRUST_PROXY_HOPS`, never `true`, so Express counts back from the forgeable end of `X-Forwarded-For` — `app/security.ts`. A misconfiguration warns loudly in production rather than silently bucketing every caller together. |
| Host header attacks            | reset-link poisoning, virtual-host routing, cache poisoning           | Nothing reads `Host` — same answer as [Host header injection](injection.md#into-a-path-or-a-model).                                                                                                                                                                  |
| Hop-by-hop header abuse        | `Connection: X-Forwarded-For` makes an intermediary strip the real IP | The deployment's proxy owns this. The hop count above is what limits the damage: a stripped header shortens the chain rather than handing the attacker a chosen IP.                                                                                                  |
| Method override abuse          | `X-HTTP-Method-Override`, `_method`                                   | No method-override middleware is installed, so both are inert.                                                                                                                                                                                                       |
| Header size / count abuse      | limits differ between layers                                          | Node's own `maxHeaderSize` applies; `headersTimeout` bounds how long they may take to arrive.                                                                                                                                                                        |

## Cheap request, expensive server

| Attack                                      | How it works                                                | This boilerplate                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slow HTTP (Slowloris, slow POST, slow read) | connections held open with minimal traffic exhaust the pool | `headersTimeout` 15s and `requestTimeout` 120s, down from Node's 60s/300s — the one DoS the rate limiter cannot see, since it counts REQUESTS and these send a fraction of one per connection. Both bound RECEIVING only, so a slow invoice render is unaffected — `app/security.ts#applyServerTimeouts` |
| HTTP/2 rapid reset                          | cheap stream resets exhaust the server                      | No surface at this process: it serves HTTP/1.1. A terminating proxy that speaks HTTP/2 owns this row.                                                                                                                                                                                                    |
| HTTP/2 pseudo-header / CONTINUATION attacks | malformed frames handled inconsistently                     | Same — no HTTP/2 listener here.                                                                                                                                                                                                                                                                          |
| Range header abuse                          | many overlapping ranges on static files amplify work        | `express.static` serves a small set of re-encoded images; the byte ceiling bounds each one.                                                                                                                                                                                                              |
| Range / partial-content leaks               | a proxy caches partial private content                      | No surface: static files are public by construction, and the JSON API sends no `206`.                                                                                                                                                                                                                    |
| Early hints / `103` confusion               | interim responses mishandled across layers                  | No surface: nothing sends `103`.                                                                                                                                                                                                                                                                         |

## Related

- [Denial of service](denial-of-service.md) — the availability half of this family
- [Data layer](data-layer.md#the-cache) — the same cache, from the storage side
- [Infrastructure](infrastructure.md) — the proxy and the edge this page keeps deferring to
