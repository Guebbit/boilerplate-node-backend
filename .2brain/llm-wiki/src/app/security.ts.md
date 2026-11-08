---
source: src/app/security.ts
sha256: 2228d4124d2683f1ee4f2f73e6102d4cc9ee4fbe819b09c849524f2ede94421b
generated_at: 2026-11-08T03:14:09.912358+00:00
model: ollama:qwen3.8:27b
---

# src/app/security.ts

## Purpose

Installs transport-level security middleware (secure headers, CORS, rate limiting, body parsing, server timeouts) in a strict order where sequence is load-bearing: trust proxy → rate limiter → body parsers → content-type guard. Splits installation into two functions (`installSecurity`, `installRequestParsing`) so `src/app.ts` can mount static file serving between them, keeping static assets out of the rate-limit budget.

## Key elements

- **`applyServerTimeouts(server: Server)`** — Sets `headersTimeout`, `requestTimeout`, and `keepAliveTimeout` on the Node HTTP server from `appConfig()`. Guards against Slowloris / slow-POST without affecting handler execution time.
- **`installSecurity(app: Express)`** — Configures strong ETags, `trust proxy` (numeric hops or `false`), `helmet()`, a global `Vary: Origin` header, and strict CORS (origin allowlist via `isAllowedOrigin`, explicit allowed/exposed headers).
- **`installRequestParsing(app: Express)`** — Mounts, in order: `rateLimiter` → `express.json()` (with size limit and a `verify` hook that stashes `rawBody` on webhook paths) → `limitJsonDepth` → `cookieParser` → `requireDeclaredContentType`.
- **`RAW_BODY_PATHS`** (module-level const) — Built once at import from `enabledModules[].rawBodyPaths`, prefixed with each module's `basePath`, lowercased.
- **`isRawBodyPath(url)`** — Segment-boundary, case-insensitive match against `RAW_BODY_PATHS` so `/payments/webhook-test` is not mistaken for `/payments/webhook`.
- **`jsonBodyLimit()`** — Returns `appConfig().NODE_JSON_BODY_LIMIT` as the explicit `express.json` size cap.

## Relationships

- **`src/app.ts`** — Caller of both install functions and `applyServerTimeouts`; inserts static-file middleware between the two phases.
- **`src/app/config.ts`** — Supplies `appConfig()` values for every timeout, the JSON body limit, and `NODE_TRUST_PROXY_HOPS`.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides the `rateLimiter` handler mounted first in `installRequestParsing`.
- **`src/infrastructure/http/middlewares/content-type.ts`** — Provides `requireDeclaredContentType`, mounted last to reject bodies no parser consumed.
- **`src/infrastructure/http/middlewares/json-depth.ts`** — Provides `limitJsonDepth` and `JSON_BODY_TYPES` (the `type` filter for the JSON parser).
- **`src/infrastructure/http/origins.ts`** — Provides `isAllowedOrigin`, the sole origin-check callback inside the `cors` config.
- **`src/modules.ts`** — Provides `enabledModules`, the registry from which `RAW_BODY_PATHS` is composed.
- **`package.json`** — Declares runtime dependencies used here (`helmet`, `cors`, `cookie-parser`, `express`).
- **`tests/unit/app/server-timeouts.test.ts`** — Unit-tests `applyServerTimeouts`.
- **`tests/unit/app/trust-proxy.test.ts`** — Unit-tests the trust-proxy / rate-limiter interaction.
- **`tests/cross-cutting/security-headers-conformance.test.ts`** — Asserts the header set produced by `installSecurity`.
- **`tests/integration/scenarios/demo-routes.test.ts`** — Exercises the full middleware chain end-to-end.

## Notes

- **`trust proxy` must be `false` (boolean), not `0`, when no proxy is configured.** `express-rate-limit` detects the "trust proxy is off" state via `=== false` and logs a warning if an `X-Forwarded-For` header arrives from an uncounted proxy. Passing `0` silently skips that safety net.
- **CORS rejection uses `callback(null, false)`, never an `Error`.** Passing an error throws into Express's error chain, turning a refused cross-origin call into a generic 500 before the route runs.
- **`Vary: Origin` is set unconditionally**, not only when a CORS header is reflected. Without it, a shared cache could store a refused-origin response (no CORS headers) under the same key as an allowed-origin response, breaking the real client.
- **`RAW_BODY_PATHS` is computed once at import.** The module registry is fixed at boot; rebuilding per request would add a `flatMap` cost to every JSON body parsed.
- **The `verify` hook in `express.json` preserves the raw `Buffer` only for paths in `RAW_BODY_PATHS`**, enabling HMAC verification over the exact transmitted bytes on webhook endpoints without copying every body.
- **`isRawBodyPath` matches at a segment boundary** (`path`, `path?…`, `path/…`), never as a bare prefix, and compares case-insensitively because Express routes are case-insensitive.
