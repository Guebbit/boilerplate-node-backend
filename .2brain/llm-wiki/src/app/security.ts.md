---
source: src/app/security.ts
sha256: 8995198f95a40da91dbea3b592fa10bb4cdddc1b0131296f38a17b444d1a70db
generated_at: 2026-10-14T07:39:18.578078+00:00
model: ollama:qwen3.8:27b
---

# src/app/security.ts

## Purpose

Transport-level security and body-parsing middleware for the Express app. Exists as a single file because **installation order is load-bearing** (trust-proxy → rate limiter → body parsers → content-type check) and the ordering rationale is non-obvious. Splits into two exported install functions so `src/app.ts` can mount static-file serving between them.

## Key elements

- **`applyServerTimeouts(server: Server)`** — Sets `headersTimeout`, `requestTimeout`, and `keepAliveTimeout` on the Node `http.Server` instance. Protects against Slowloris / slow-POST by capping how long a client may spend *sending* a request. Values come from `appConfig()`.
- **`installSecurity(app: Express)`** — Installs: strong ETags, `trust proxy` (hops from config, `false` when 0), `helmet`, a `Vary: Origin` middleware, and strict CORS (origin allow-list via `isAllowedOrigin`, explicit allowed/exposed header lists).
- **`installRequestParsing(app: Express)`** — Installs, in order: `rateLimiter` → `express.json` (with configurable limit, merge-patch content type, and a `verify` hook that stashes `rawBody` on webhook paths) → `limitJsonDepth` → `cookieParser` → `requireDeclaredContentType`.
- **`RAW_BODY_PATHS`** / **`isRawBodyPath(url)`** — Precomputed list (built once at import from `enabledModules`' `rawBodyPaths`) and a segment-boundary matcher used by the JSON `verify` hook to preserve the exact request buffer for HMAC-signed webhooks.
- **`jsonBodyLimit()`** — Returns `appConfig().NODE_JSON_BODY_LIMIT` as the explicit `express.json` limit.

## Relationships

- **`src/app.ts`** — Imports and calls `installSecurity` and `installRequestParsing` in sequence, with static-file middleware mounted between them.
- **`src/app/config.ts`** — Source of all tunable values: `NODE_TRUST_PROXY_HOPS`, `NODE_JSON_BODY_LIMIT`, `NODE_HTTP_HEADERS_TIMEOUT_MS`, `NODE_HTTP_REQUEST_TIMEOUT_MS`, `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS`.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies the `rateLimiter` handler; reads `trust proxy` setting to decide whether to warn on uncounted proxies.
- **`src/infrastructure/http/middlewares/content-type.ts`** — Supplies `requireDeclaredContentType`, the final gate refusing bodies no parser understood.
- **`src/infrastructure/http/middlewares/json-depth.ts`** — Supplies `limitJsonDepth`, preventing stack overflow on deeply nested JSON.
- **`src/infrastructure/http/origins.ts`** — Supplies `isAllowedOrigin`, the single source of truth for CORS origin validation.
- **`src/modules.ts`** — Supplies `enabledModules`, from which `RAW_BODY_PATHS` is derived (each module declares its own `rawBodyPaths` and `basePath`).
- **`tests/unit/app/server-timeouts.test.ts`** — Verifies `applyServerTimeouts` sets the three timeout properties.
- **`tests/unit/app/trust-proxy.test.ts`** — Verifies the `trust proxy` value Express receives for various hop configs.
- **`tests/integration/scenarios/demo-routes.test.ts`** — Exercises the full middleware chain end-to-end.

## Notes

- The CORS `origin` callback returns `callback(null, false)` for disallowed origins, **never** an `Error`. An error would short-circuit into Express's error handler and produce a 500; `false` simply omits `Access-Control-Allow-Origin` and lets the browser's same-origin policy enforce the denial.
- `trust proxy` is set to `false` (boolean) when hops are 0, not `0`. `express-rate-limit` detects "trust proxy is off" via `=== false`, and only then logs a warning if an `X-Forwarded-For` header arrives from an uncounted proxy.
- `keepAliveTimeout` should be **raised** above the upstream TLS-terminating proxy's idle timeout to avoid 502s on stale-socket reuse.
- The `Vary: Origin` header is added unconditionally (separate middleware) because `cors` only adds it when reflecting an allowed origin; without it, a shared cache could serve the header-less variant to a legitimate frontend.
- `RAW_BODY_PATHS` is computed once at module import time, not per request, to avoid a `flatMap` on every JSON body.
