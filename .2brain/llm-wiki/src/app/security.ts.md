---
source: src/app/security.ts
sha256: 22881908ce03e9815615a66c0a855788735956242af474d386ff7a49a671a1df
generated_at: 2026-09-27T14:03:02.475667+00:00
model: ollama:qwen3.8:27b
---

# src/app/security.ts

## Purpose

Installs transport-level protections (secure headers, CORS, rate limiting, body parsing) and server timeout bounds for the Express application. The file's central concern is **order**: `trust proxy` → rate limiter → body parsers → routes, because each step depends on state set by the previous one. It is split into two exported installers so that `src/app.ts` can serve static files *between* the security headers and the request-parsing chain.

## Key elements

- **`applyServerTimeouts(server: Server)`** — Sets `headersTimeout`, `requestTimeout`, and `keepAliveTimeout` from env vars (`NODE_HTTP_*`), defending against slowloris/slow-POST. Bounds *receiving* only; never affects handler execution time.
- **`installSecurity(app: Express)`** — Configures `etag: 'strong'`, `trust proxy` (hop count, not boolean), installs `helmet()`, and a strict `cors()` middleware that whitelists origins from `NODE_CORS_ORIGIN` and returns `false` (not an `Error`) for disallowed origins.
- **`installRequestParsing(app: Express)`** — Mounts `rateLimiter`, then `express.urlencoded`, then `express.json` (with a `verify` hook that stashes the raw `Buffer` on `request.rawBody` for webhook HMAC verification on known paths), then `cookieParser`.
- **`RAW_BODY_PATHS` / `isRawBodyPath(url)`** — Built once at import time from `enabledModules[].rawBodyPaths`. Segment-boundary match (not bare prefix) to avoid `/payments/webhook-test` matching `/payments/webhook`.
- **`allowedOrigins`** — `Set` parsed from `NODE_CORS_ORIGIN` (comma-separated, blanks dropped).
- **`JSON_BODY_LIMIT`** — Body-size cap for both JSON and urlencoded parsers, from `NODE_JSON_BODY_LIMIT` (default `100kb`).

## Relationships

- **`src/app.ts`** — Calls `installSecurity` and `installRequestParsing` as two separate steps, mounting static-file serving between them.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides the `rateLimiter` middleware consumed by `installRequestParsing`.
- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentNumber` used by all timeout/hop-count env reads.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger.warn` for the production trust-proxy-0 warning.
- **`src/modules.ts`** — Provides `enabledModules`; each module's `rawBodyPaths` and `basePath` feed `RAW_BODY_PATHS`.
- **`tests/unit/app/server-timeouts.test.ts`** — Unit-tests `applyServerTimeouts` against mocked `Server` instances.
- **`tests/integration/app/demo-routes.test.ts`** — Exercises the full middleware chain (CORS, rate-limit, body parsing) end-to-end.
- **`package.json`** — Declares the runtime dependencies (`express`, `helmet`, `cors`, `cookie-parser`) this file imports.

## Notes

- **CORS failure path**: the `origin` callback returns `false`, never an `Error`. Throwing into Express's error chain would produce a generic 500 *before* the route runs; `false` simply omits the `Access-Control-Allow-Origin` header and lets the browser's same-origin policy do the blocking.
- **`trust proxy` is a number**: it is the *count* of reverse-proxy hops, not a boolean. `0` is valid for a directly-published container; the file warns in production when `0` is used but cannot distinguish "correctly direct" from "forgot to set it."
- **Raw-body preservation is per-path, not global**: the `verify` hook fires on *every* JSON body the API receives, but only *copies* the buffer when the URL matches a registered webhook path. This keeps memory cost proportional to webhook traffic, not total traffic.
- **`RAW_BODY_PATHS` is computed once at module load**: it is fixed by the module registry and never changes at runtime, so there is no per-request rebuild cost.
- **`keepAliveTimeout` is exposed, not changed**: the default (5 s) is kept; the env var exists so operators can *raise* it above their TLS-terminating proxy's idle timeout to avoid 502s from half-closed sockets.
