# src/app/security.ts

## Purpose

Installs transport-level security middleware (secure headers, strict CORS, body parsers, rate limiting) onto an Express app in a single call. Exists as a dedicated module because the **ordering** of these middlewares is non-obvious and security-critical: `trust proxy` must precede the rate limiter, and body parsers must precede any handler that reads `request.body`.

## Key elements

- **`allowedOrigins`** (module-level `Set<string>`) — CORS origin allowlist parsed from `NODE_CORS_ORIGIN` (comma-separated; defaults to `http://localhost:8080`). Trailing commas and blank entries are silently dropped.
- **`installSecurity(app: Express)`** (exported) — applies, in order:
  1. `app.set('etag', 'strong')` — forces strong ETag comparison to prevent stale 304s.
  2. `app.set('trust proxy', …)` — sets the proxy-hop count from `NODE_TRUST_PROXY_HOPS` so Express resolves `request.ip` correctly behind proxies.
  3. `helmet()` — security response headers.
  4. `cors(…)` — strict origin check against `allowedOrigins`; allows requests with no `Origin` header (curl, health checks); sets `credentials: true` and an explicit allowlist of methods/headers.
  5. `express.urlencoded` / `express.json` — body parsers.
  6. `cookieParser()` — decodes `Cookie` header into `request.cookies`.
  7. `rateLimiter` — per-IP bucket limiting (keys on `request.ip`, hence the trust-proxy ordering).

## Relationships

- **`src/app.ts`** — consumes `installSecurity` to wire these middlewares into the application before route registration.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — supplies the `rateLimiter` middleware that is mounted last in the chain.
- **`src/infrastructure/runtime/environment.ts`** — supplies `environmentNumber`, used to read `NODE_TRUST_PROXY_HOPS` with a floor of 0.
- **`package.json`** — declares the runtime dependencies this file imports: `express`, `helmet`, `cors`, `cookie-parser`.

## Notes

- **Order is load-bearing.** Moving `rateLimiter` above `trust proxy` breaks IP-based bucketing; moving body parsers below a handler that reads `request.body` causes `undefined` reads. Do not reorder without re-reading the docblock at the top of the file.
- `NODE_TRUST_PROXY_HOPS` must be a **numeric count**, never a boolean (`true`). A boolean makes Express trust the full `X-Forwarded-For` chain, which is forgeable.
- Non-browser clients (no `Origin` header) bypass the origin check by design; they are still subject to rate limiting and all other protections.
- `exposedHeaders` deliberately limits what browsers can read to `x-request-id` and `traceparent` for request-tracing correlation.
