---
source: src/app/request-context.ts
source_sha256: 317587b46d4be79362c3923287dcf7f7f9b6cf180bf657a4755d4c356381c08e
context_sha256: dc53e7609c2b9dba816dbff69cf91fd7538bc397ba9b44f1b2d06b5d045d4f4f
generated_at: 2026-11-22T02:31:02.599663+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/request-context.ts

## Purpose
Groups the per-request context that the rest of a request reads: the request ID and the access log and observability handle. It exists so that this setup is one unit that is mounted before the routes. The request ID middleware is the exception, because the access log and every audit entry record the ID, so `createApp` mounts it earlier.

## Key elements
- `REQUEST_ID_PATTERN` (private): regex for a canonical UUID of any RFC 4122 version or variant. It is the only shape of client `x-request-id` that gets recorded. The value reaches Winston and audit entries verbatim, so validating it prevents log injection from newlines, control characters, or very long strings.
- `requestIdMiddleware`: an Express `RequestHandler`.
  - It reads `x-request-id` and keeps it as `clientRequestId` only if it matches the UUID pattern.
  - It sets `request.requestId` to a fresh `crypto.randomUUID()`, unless `tracingConfig().NODE_TRUSTED_INGRESS` is set and a valid client ID exists. In that case the client ID is used as the request ID.
  - It sets `request.clientRequestId` and the `x-request-id` response header, then calls `next()`.
- `installRequestContext(app)`: mounts `requestLogger` (Winston access log plus OpenTelemetry trace injection) with `app.use`.

## Relationships
- `src/app.ts`: `createApp` mounts `requestIdMiddleware` before `installSecurity`, and `installRequestContext` is installed as a group before the routes.
- `src/infrastructure/http/middlewares/request-logger.ts`: provides `requestLogger`, which `installRequestContext` mounts.
- `src/infrastructure/runtime/config.ts`: provides `tracingConfig()`, whose `NODE_TRUSTED_INGRESS` flag decides whether the client ID is trusted.
- Tests: `tests/cross-cutting/request-headers-conformance.test.ts`, `tests/integration/refusal-request-id.test.ts` and `tests/integration/scenarios/demo-routes.test.ts` are related in the dependency graph. The file content doesn't show what they assert.

## Notes
- By default the service never echoes the caller's ID as its own `requestId`. The client's value is kept separately as `clientRequestId`, which is logged and audited under that name, like an AWS ALB's own ID.
- Because the middleware runs before `installSecurity`, requests refused by the global rate limiter still carry `x-request-id`. The access log is mounted after the limiter, so it never sees those requests.
- A malformed `x-request-id` is silently dropped and a generated UUID is used instead.
