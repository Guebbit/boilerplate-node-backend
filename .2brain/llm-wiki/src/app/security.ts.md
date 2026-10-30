---
source: src/app/security.ts
sha256: 2228d4124d2683f1ee4f2f73e6102d4cc9ee4fbe819b09c849524f2ede94421b
generated_at: 2026-10-29T01:51:08.093208+00:00
model: ollama:qwen3.8:27b
---

# src/app/security.ts

## Purpose

Declares and installs every transport-level protection this Express application needs—secure headers, CORS, rate limiting, body parsing, and server timeouts—split into two install phases so `src/app.ts` can serve static files between them. The ordering is deliberate and non-obvious (trust-proxy before rate limiter, rate limiter before parsers, parsers before content-type enforcement); this file is the single place that documents and enforces that order.

## Key elements

- **`applyServerTimeouts(server: Server)`** — Sets `headersTimeout`, `requestTimeout`, and `keepAliveTimeout` from `appConfig()` values. Bounds only the *receiving* side; a slow handler is unaffected.
- **`installSecurity(app: Express)`** — First install (runs before static files). Sets strong ETag, configures `trust proxy` (hops count, not boolean), applies `helmet()`, forces `Vary: Origin` on every response, and installs a strict `cors` middleware with an explicit allow-list of origins, methods, headers, and exposed headers.
- **`installRequestParsing(app: Express)`** — Second install (runs after static files). Mounts, in order: `rateLimiter` → `express.json` (with size limit, raw-body capture on webhook paths) → `limitJsonDepth` → `cookieParser` → `requireDeclaredContentType`.
- **`RAW_BODY_PATHS`** (module-level const) — Flat list of URL paths (lowercased, prefixed with the owning module's base path) whose JSON body must be preserved verbatim for HMAC webhook verification. Built once at import from `enabledModules`.
- **`isRawBodyPath(url)`** — Segment-boundary, case-insensitive match against `RAW_BODY_PATHS` so `/payments/webhook-test` is not mistaken for `/payments/webhook`.
- **`jsonBodyLimit()`** — Returns the configurable JSON body size cap from `appConfig().NODE_JSON_BODY_LIMIT`.

## Relationships

- **`src/app.ts`** — The consumer; calls `installSecurity` before mounting static files and `installRequestParsing` after them, then calls `applyServerTimeouts` on the listening `Server`.
- **`src/app/config.ts`** — Source of all `NODE_*` configuration values (timeouts, trust-proxy hops, JSON body limit) read at install time.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies the `rateLimiter` handler; depends on `trust proxy` being set first (keys buckets on `request.ip`).
- **`src/infrastructure/http/middlewares/json-depth.ts`** — Supplies `limitJsonDepth` and `JSON_BODY_TYPES`; mounted immediately after the JSON parser.
- **`src/infrastructure/http/middlewares/content-type.ts`** — Supplies `requireDeclaredContentType`; mounted last in the parsing chain to reject bodies no parser recognised.
- **`src/infrastructure/http/origins.ts`** — Supplies `isAllowedOrigin` used inside the CORS callback.
- **`src/modules.ts`** — Supplies `enabledModules`; each module may declare `rawBodyPaths` that feed into `RAW_BODY_PATHS`.
- **`tests/unit/app/server-timeouts.test.ts`**, **`tests/unit/app/trust-proxy.test.ts`**, **`tests/cross-cutting/security-headers-conformance.test.ts`**, **`tests/integration/scenarios/demo-routes.test.ts`** — Exercise the exported functions and their ordering guarantees.

## Notes

- **Two installs, one reason:** `installSecurity` must run before static files (so an image gets helmet + CORS), while `installRequestParsing` must run after them (so a page-load image doesn't burn the caller's rate-limit budget). The split is load-bearing.
- **`trust proxy` is `false`, not `0`, when there is no proxy.** `express-rate-limit` detects "trust proxy off" via `=== false` and will log a warning if it sees a forged `X-Forwarded-For`—a misconfiguration worth surfacing.
- **CORS denial uses `callback(null, false)`, never `callback(new Error(...))`.** An error enters Express's error chain and turns a legitimate route into a 500; `false` simply omits the header and lets the browser's own same-origin policy reject the response.
- **Raw-body capture is a per-path `verify` hook, not a global middleware.** Only webhook endpoints that authenticate via HMAC over exact bytes receive `request.rawBody`; every other JSON body is parsed normally.
- **`Vary: Origin` is set on every response**, not just CORS-allowed ones, to prevent a shared cache from storing a header-less response under the same key as the allowed one.
