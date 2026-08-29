# src/app/security.ts

## Purpose

Installs the application's transport-level security middleware chain—secure headers, strict CORS, body parsing, and rate limiting—onto the Express instance. This file exists to encode the *order* in which those middlewares are registered, because the order is security-relevant (e.g. `trust proxy` must precede the rate limiter, body parsers must precede any handler that reads `request.body`). The actual handlers come from infrastructure; this file is the composition point.

## Key elements

- **`allowedOrigins`** (`Set<string>`) — CORS origin whitelist parsed from `NODE_CORS_ORIGIN` (comma-separated, trimmed, blank entries dropped). Defaults to `http://localhost:8080`.
- **`installSecurity(app: Express)`** — the sole export. Registers, in order:
  1. `etag` set to `strong` (avoids stale-304 from weak comparison).
  2. `trust proxy` set to the numeric hop count from `NODE_TRUST_PROXY_HOPS` (default 0).
  3. `helmet()` — security response headers.
  4. `cors(...)` — strict origin check against `allowedOrigins`; allows requests with no `Origin` header (curl, health checks); enables credentials; restricts methods and allowed/exposed headers.
  5. `express.urlencoded` + `express.json` — body parsers.
  6. `cookieParser` — cookie parsing.
  7. `rateLimiter` — IP-based rate limiting (keys on `request.ip`, hence the trust-proxy dependency).

## Relationships

- **`src/infrastructure/http/middlewares/security.ts`** — provides the `rateLimiter` middleware that `installSecurity` mounts last.
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber`, used to read `NODE_TRUST_PROXY_HOPS` with a typed default of `0`.
- **`src/app.ts`** — the caller that invokes `installSecurity` during application bootstrap.
- **`package.json`** — declares the runtime dependencies consumed here (`express`, `helmet`, `cors`, `cookie-parser`).

## Notes

- **Order is load-bearing.** Reordering the registrations (e.g. moving `rateLimiter` before `trust proxy`, or body parsers after a handler that reads `request.body`) silently breaks security guarantees without throwing.
- **`trust proxy` must be a number, never `true`.** `true` makes Express trust the *entire* `X-Forwarded-For` chain, which is client-forgeable. The count is read via `environmentNumber` so a misconfigured value defaults to `0` (socket address only).
- **CORS allows credential-less, non-browser requests.** A request with no `Origin` header bypasses the origin check entirely; this is intentional for curl/health-check traffic.
- **`allowedOrigins` is a `Set`, not an array.** Membership checks are O(1) and the set is built once at module load from the environment; changing `NODE_CORS_ORIGIN` at runtime has no effect.
