# src/app/security.ts

## Purpose

Installs the application's transport-level security stack (secure headers, strict CORS, body-size-bounded parsing, and rate limiting) onto an Express instance in a specific order. It exists as a single, ordered call-site so the dependency between `trust proxy`, the rate limiter's IP keying, and body-parser availability is visible in one place.

## Key elements

- **`installSecurity(app: Express): void`** — sole export. Sets `etag` to `strong`, configures `trust proxy` from an env var, then installs in order: `helmet()`, strict `cors`, `express.urlencoded` / `express.json` (both capped by `JSON_BODY_LIMIT`), `cookieParser`, and `rateLimiter`.
- **`JSON_BODY_LIMIT`** — reads `NODE_JSON_BODY_LIMIT` (default `'100kb'`); applied as the `limit` on both body parsers.
- **`allowedOrigins`** — a `Set<string>` parsed from `NODE_CORS_ORIGIN` (default `http://localhost:8080`). Comma-separated, trimmed, empty entries dropped.
- **Trust-proxy setup** — `environmentNumber('NODE_TRUST_PROXY_HOPS', 0, 0)` yields a hop count (never boolean). Emits a `logger.warn` in production when the value is `0`.

## Relationships

- **`src/app.ts`** — calls `installSecurity(app)` during application bootstrap.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — exports `rateLimiter`, the final middleware installed. It buckets by `request.ip`, which is why `trust proxy` must be set *before* this runs.
- **`src/infrastructure/runtime/environment.ts`** — exports `environmentNumber`, used to parse `NODE_TRUST_PROXY_HOPS` with a floor of `0`.
- **`src/infrastructure/adapters/logger.ts`** — exports `logger`; used for the production `trust proxy = 0` warning.
- **`package.json`** — declares the third-party deps consumed here: `express`, `helmet`, `cors`, `cookie-parser`.

## Notes

- **Order is load-bearing.** `trust proxy` → rate limiter (IP keying) → body parsers (so downstream handlers see `request.body`). Reordering silently breaks one or more.
- **`trust proxy` is a hop count, never `true`.** A count of `0` means "trust the socket address" and is legitimate for the compose stack that publishes the API directly; it is dangerous behind a reverse proxy and is only a runtime warning, not a boot failure.
- **CORS allows requests with no `Origin` header** (curl, health-checks) by returning `true` before checking `allowedOrigins`.
- **Strong ETags** are set explicitly to prevent weak-comparison 304s from serving stale data.
- **`NODE_JSON_BODY_LIMIT`** is distinct from `NODE_MAX_UPLOAD_BYTES` (multipart); they bound different parsers.
