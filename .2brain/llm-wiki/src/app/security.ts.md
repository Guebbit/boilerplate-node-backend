---
source: src/app/security.ts
sha256: 530a1c709462255c038815ce98490cb306783baf35b1ba6c36aad2f3ecdc6b8a
generated_at: 2026-10-01T12:45:17.433094+00:00
model: ollama:qwen3.8:27b
---

# src/app/security.ts

## Purpose

Centralises all transport-level protections (secure headers, CORS, rate limiting, body parsing, server timeouts) in one file because their relative order is load-bearing and non-obvious. It is split into two install functions (`installSecurity`, `installRequestParsing`) so that `src/app.ts` can mount static-file serving between them, letting page assets bypass the caller's request budget.

## Key elements

- **`applyServerTimeouts(server: Server)`** – Sets `headersTimeout`, `requestTimeout`, and `keepAliveTimeout` on the listening server. Bounds only the *receiving* side (how long a client may take to send), never the handler. Guards against Slowloris / slow-POST that the rate limiter (which counts requests) would not see.
- **`installSecurity(app: Express)`** – Sets strong ETags, `trust proxy` (as a hop *count*, not a boolean), mounts `helmet()`, and configures strict CORS. CORS denial uses `callback(null, false)` (omit the header) rather than an error, so the browser's same-origin policy does the refusing and no spurious 500 is produced.
- **`installRequestParsing(app: Express)`** – Mounts, in order: `rateLimiter` → `express.urlencoded` → `express.json` (with a `verify` hook that stashes `rawBody` for webhook HMAC verification) → `cookieParser` → `requireDeclaredContentType`. A throttled request is refused before any parsing cost.
- **`RAW_BODY_PATHS` / `isRawBodyPath`** – Built once at import from `enabledModules`. Segment-boundary match (`/payments/webhook` does not match `/payments/webhook-test`).
- **`allowedOrigins`** – A `Set` parsed from `NODE_CORS_ORIGIN` (comma-separated), defaulting to `http://localhost:8080`.
- **`JSON_BODY_LIMIT`** – Read from `appConfig().NODE_JSON_BODY_LIMIT`, making the 100 kb Express default explicit and configurable.

## Relationships

- **`src/app.ts`** – Calls `applyServerTimeouts`, `installSecurity`, static-file mount, then `installRequestParsing`, in that order. This file is the single place that decides *which* middleware the app installs and *where*.
- **`src/app/config.ts`** – Supplies `appConfig()` for body limits, HTTP timeout values, and `NODE_TRUST_PROXY_HOPS`.
- **`src/infrastructure/http/config.ts`** – Supplies `siteConfig().NODE_CORS_ORIGIN` for the allowed-origin set.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Provides the `rateLimiter` handler installed first in `installRequestParsing`.
- **`src/infrastructure/http/middlewares/content-type.ts`** – Provides `requireDeclaredContentType`, the final gate after all parsers.
- **`src/infrastructure/runtime/config.ts`** – `isRelaxedEnvironment()` gates the trust-proxy warning so dev/test don't log it.
- **`src/infrastructure/adapters/logger.ts`** – Emits the `NODE_TRUST_PROXY_HOPS=0` production warning.
- **`src/modules.ts`** – `enabledModules` registry; each module's `rawBodyPaths` and `basePath` are flattened into `RAW_BODY_PATHS` at import time.
- **`tests/unit/app/server-timeouts.test.ts`** – Unit-tests the three timeout setters.
- **`tests/unit/app/trust-proxy-warning.test.ts`** – Asserts the warn fires in prod and is suppressed in relaxed envs.
- **`tests/integration/app/demo-routes.test.ts`** – Integration-level exercise of the full middleware stack.

## Notes

- **Order is a contract.** Trust-proxy → rate limiter → body parsers → content-type check. Reordering any pair changes security semantics (e.g. parsing before rate-limiting lets a flood spend CPU on JSON parsing).
- **`trust proxy` is a number, never `true`.** A count makes Express peel exactly that many hops from `X-Forwarded-For`; `true` trusts the whole header. `0` is valid for a direct-published container and triggers a startup warning outside relaxed environments.
- **CORS uses `false`, not an `Error`.** Throwing into the Express error chain would turn a denied cross-origin call into a generic 500 before the route runs; `false` simply omits `Access-Control-Allow-Origin` and lets the browser's policy reject the response.
- **Raw-body preservation is a per-path opt-in**, not a blanket copy. The `verify` hook checks `isRawBodyPath` before allocating the buffer, so the majority of JSON requests pay nothing extra.
- **`keepAliveTimeout` is exposed, not changed, from Node's 5 s default.** It must be set *above* the upstream proxy's idle timeout to avoid 502s on half-closed sockets.
- **`express.json` also accepts `application/merge-patch+json`** so RFC 7396 PATCH bodies parse without a client workaround.
