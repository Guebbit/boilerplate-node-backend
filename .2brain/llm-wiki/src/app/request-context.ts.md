---
source: src/app/request-context.ts
sha256: 9940c9bfb484590b4ff7a5f6441fffe7c870993a5dbfe01303315845f0d00286
generated_at: 2026-10-29T01:50:41.643962+00:00
model: ollama:qwen3.8:27b
---

# src/app/request-context.ts

## Purpose

Centralises per-request context setup: the request-ID middleware and the access-logging / observability handle. It exists as a single group because everything it attaches is read downstream by routes, audit entries, and the access log, so it must be mounted before them.

## Key elements

- **`requestIdMiddleware`** (`RequestHandler`) — Validates the incoming `x-request-id` against a strict RFC 4122 UUID pattern. Sets `request.requestId` (always a service-chosen UUID, or the client's value when `NODE_TRUSTED_INGRESS` is set) and `request.clientRequestId` (the validated client-supplied id, if any). Echoes the chosen id back in the `x-request-id` response header.
- **`REQUEST_ID_PATTERN`** (module-private) — Regex matching a canonical lowercase/uppercase UUID; the only shape accepted from a client header. Prevents log-injection via newlines, control chars, or arbitrary-length strings.
- **`installRequestContext(app)`** — Mounts `requestLogger` (Winston access log + OpenTelemetry trace injection) on the Express app. Thin one-liner wrapper.

## Relationships

- **`src/infrastructure/http/middlewares/request-logger.ts`** — Imported and mounted inside `installRequestContext`; this file is the sole caller of `requestLogger`.
- **`src/infrastructure/runtime/config.ts`** — Provides `tracingConfig()`, from which `NODE_TRUSTED_INGRESS` is read to decide whether the client-supplied id is trusted as the request id.
- **`src/app.ts`** — The mounting site: calls `requestIdMiddleware` (before security/rate-limiting) and `installRequestContext` (after the limiter but before routes).
- **`tests/integration/refusal-request-id.test.ts`** — Verifies that refused (rate-limited) requests still carry `x-request-id`, confirming the middleware is mounted ahead of the limiter.
- **`tests/cross-cutting/request-headers-conformance.test.ts`** — Exercises the UUID validation and header round-trip behaviour.
- **`tests/integration/scenarios/demo-routes.test.ts`** — End-to-end scenario that exercises the full request-context chain.

## Notes

- `requestIdMiddleware` is deliberately **not** inside `installRequestContext`; it is mounted separately and earlier (before `installSecurity`), so that even globally rate-limited requests get an `x-request-id` header. The access log (inside `installRequestContext`) runs *after* the limiter and therefore never logs refused requests.
- When `NODE_TRUSTED_INGRESS` is absent, a valid client UUID is recorded only as `request.clientRequestId`, never as `request.requestId`. The service always generates its own id.
- The UUID pattern enforces `[da-f]` hex digits with the standard 8-4-4-4-12 shape; any deviation (uppercase beyond `a-f`, version/variant nibbles outside `0-9a-f`) is rejected and treated as absent.
