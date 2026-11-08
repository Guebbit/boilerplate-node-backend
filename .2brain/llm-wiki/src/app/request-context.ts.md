---
source: src/app/request-context.ts
sha256: 9940c9bfb484590b4ff7a5f6441fffe7c870993a5dbfe01303315845f0d00286
generated_at: 2026-11-08T03:13:33.488518+00:00
model: ollama:qwen3.8:27b
---

# src/app/request-context.ts

## Purpose

Per-request context middleware: assigns a request ID, preserves a client-supplied ID when trusted, and installs the access logger. It must run before any route handler so that every downstream consumer (routes, audit entries, the access log) can read `request.requestId` and `request.clientRequestId`.

## Key elements

- **`REQUEST_ID_PATTERN`** (module-private) – Regex that validates a canonical RFC 4122 UUID. Used to gate whether a client-supplied `x-request-id` is accepted; anything non-conforming is discarded, preventing log-injection via newlines, control characters, or overlong strings.
- **`requestIdMiddleware`** (exported `RequestHandler`) – Sets `request.requestId` (always a server-chosen UUID unless `NODE_TRUSTED_INGRESS` is set) and `request.clientRequestId` (the validated client header, or `undefined`). Responds with `x-request-id: <server requestId>`. The trusted-ingress path is the only case where the client value becomes the request ID itself.
- **`installRequestContext(app)`** (exported) – Registers `requestLogger` (Winston access log + OpenTelemetry trace injection) on the Express app.

## Relationships

- **`src/app.ts`** – Calls `requestIdMiddleware` (before `installSecurity` / rate limiter) and `installRequestContext`, establishing the mount order documented in the module header.
- **`src/infrastructure/http/middlewares/request-logger.ts`** – Consumed by `installRequestContext`; provides the Winston access log and OTel trace injection.
- **`src/infrastructure/runtime/config.ts`** – Supplies `tracingConfig()`, from which `requestIdMiddleware` reads `NODE_TRUSTED_INGRESS` to decide whether to honour the client ID.
- **`tests/cross-cutting/request-headers-conformance.test.ts`** – Verifies the `x-request-id` / `clientRequestId` contract and the UUID validation rule.
- **`tests/integration/refusal-request-id.test.ts`** – Asserts that even rate-limiter-refused requests carry a valid `x-request-id` header (because the middleware precedes the limiter).
- **`tests/integration/scenarios/demo-routes.test.ts`** – Integration scenarios that implicitly rely on request context being populated before route handlers execute.
- **`package.json`** – Declares the `express` and `node:crypto` dependencies this module imports.

## Notes

- `requestIdMiddleware` is intentionally **not** part of `installRequestContext`; it is mounted earlier (before `installSecurity`) so that refused requests still receive a header. If you move it after the rate limiter, refused responses will lack `x-request-id`.
- The client ID is stored under `request.clientRequestId`, never under `request.requestId`, except behind a trusted ingress. Downstream code that logs or audits must read `clientRequestId` for the caller's own correlation ID.
- `REQUEST_ID_PATTERN` is intentionally strict (lowercase hex only, case-insensitive flag). A UUID with uppercase hex still passes (`/i` flag), but any other shape (v4-specific `4`/`8-b` prefix, version 0, etc.) is rejected.
