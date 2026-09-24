---
source: src/app/security.ts
sha256: c077b440e82e616ce2bbf61e586a650f0d05c416c527d90ee027d63a262ab0ce
generated_at: 2026-09-23T17:36:07.264909+00:00
model: ollama:qwen3.8:27b
---

# src/app/security.ts

## Purpose

Installs the full transport-level security stack (secure headers, strict CORS, body parsing with size limits, cookie parsing, rate limiting) and configures Node server timeouts (slowloris protection). This file is the single place that decides *which* middlewares run and *in what order*, since the sequence (trust-proxy → rate limiter → body parsers) is load-bearing and non-obvious.

## Key elements

- **`installSecurity(app: Express): void`** — Wires the middleware chain: `helmet` → `cors` (allowlist from `NODE_CORS_ORIGIN`) → `urlencoded` → `json` (with a `verify` hook that preserves the raw buffer on webhook paths) → `cookieParser` → `rateLimiter`. Also sets `etag: 'strong'` and `trust proxy` to the hop count from `NODE_TRUST_PROXY_HOPS`.
- **`applyServerTimeouts(server: Server): void`** — Sets `headersTimeout` (default 15 s), `requestTimeout` (default 120 s), and `keepAliveTimeout` (default 5 s), each overridable via environment variables read through `environmentNumber`.
- **`isRawBodyPath(url)`** — Segment-boundary match against the precomputed `RAW_BODY_PATHS` list so `/payments/webhook` doesn't accidentally match `/payments/webhook-test`.
- **`RAW_BODY_PATHS`** — Built once at import by flattening each enabled module's `rawBodyPaths` under its `basePath`.
- **`allowedOrigins: Set<string>`** — Parsed from `NODE_CORS_ORIGIN` (comma-separated, blanks dropped).
- **`JSON_BODY_LIMIT`** — Default `'100kb'`, overridable via `NODE_JSON_BODY_LIMIT`; applied to both `urlencoded` and `json` parsers.

## Relationships

- **`src/modules.ts`** — Provides `enabledModules`, from which `RAW_BODY_PATHS` is derived. A new module that needs its webhook body verified byte-for-byte declares `rawBodyPaths` and is picked up automatically.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Its exported `rateLimiter` is the last middleware in the chain; the trust-proxy setting installed earlier in this file is what makes its `request.ip` bucketing correct.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` is the sole way this file reads numeric env vars (timeout values, trust-proxy hops), enforcing validation in one place.
- **`src/infrastructure/adapters/logger.ts`** — Used for the production warning when `NODE_TRUST_PROXY_HOPS` is `0`.
- **`src/app.ts`** — Expected caller of both `installSecurity` and `applyServerTimeouts` during application bootstrap.
- **`tests/unit/app/server-timeouts.test.ts`** — Unit-tests the three timeout assignments in `applyServerTimeouts`.
- **`tests/integration/app/demo-routes.test.ts`** — Exercises the installed middleware stack end-to-end (CORS, body limits, rate limiting).

## Notes

- **Order is contractual.** Moving `app.set('trust proxy', …)` after the rate limiter, or the body parsers after a handler that reads `request.body`, silently breaks behaviour. Do not reorder without understanding the comment block at the top.
- **`trust proxy` must be a hop count (number), never `true`.** `true` makes Express trust the *entire* `X-Forwarded-For` chain, letting any client forge its IP and bypass rate-limit buckets.
- **CORS rejection uses `callback(null, false)`, not an `Error`.** Throwing an error enters Express's error chain and returns a generic 500; `false` simply omits `Access-Control-Allow-Origin` and lets the browser's same-origin policy do the work.
- **`rawBody` is only attached on specific webhook paths**, not globally. Any code reading `request.rawBody` on an unlisted path will get `undefined`.
- **`keepAliveTimeout` must exceed the upstream proxy's idle timeout.** If the server closes first, the proxy's next request hits a dead socket and the caller gets a spurious 502.
- **Stryker** mutations are disabled around the `logger.warn` call (Stryker disable/restore comments) to avoid mutating the guard that produces the warning.
- The `verify` hook in `express.json` casts the bare `http.IncomingMessage` to Express's `Request` to reach the `rawBody` property declared in `globals.d.ts`; this is the only type assertion in the file.
