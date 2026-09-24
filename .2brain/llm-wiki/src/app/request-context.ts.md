---
source: src/app/request-context.ts
sha256: 16c31f44cc873be66afd674e57c1766add48234db9a07aeb4a7d200ca90b7963
generated_at: 2026-09-23T17:35:34.315704+00:00
model: ollama:qwen3.8:27b
---

# src/app/request-context.ts

## Purpose

Installs the per-request context middlewares (correlation ID, access logging, locale) on an Express app. It exists as a single install step so that these cross-cutting concerns are guaranteed to run before any route handler, in a specific internal order that downstream code depends on.

## Key elements

- **`REQUEST_ID_PATTERN`** – Regex matching a canonical RFC 4122 UUID (any version/variant). Used to validate a client-supplied `x-request-id` before it is trusted into logs and audit entries.
- **`installRequestContext(app: Express): void`** – The sole export. Registers three middlewares in sequence:
    1. Inline request-ID middleware: reuses a valid `x-request-id` header or generates one via `crypto.randomUUID()`; sets it on `request` and the response header.
    2. `requestLogger` (Winston access log + OpenTelemetry trace injection).
    3. `attachLocale` (negotiates `Accept-Language` and makes the locale available to downstream code).

## Relationships

- **`src/app.ts`** – Calls `installRequestContext` before mounting routes, making this the entry point for request-scoped setup.
- **`src/infrastructure/http/middlewares/request-logger.ts`** – Provides `requestLogger`, the second middleware in the chain; it reads `request.requestId` set by the first middleware.
- **`src/infrastructure/http/middlewares/locale.ts`** – Provides `attachLocale`, the third middleware; it resolves the request locale that routes and services consume.
- **`tests/integration/app/demo-routes.test.ts`** – Exercises the `x-request-id` header behavior (reuse vs. generation) through the full app.

## Notes

- **Order is load-bearing.** The request-ID middleware must run first because both the access log and any audit entries record that ID. Moving it after `requestLogger` would log a missing correlation ID.
- **Client `x-request-id` is strictly validated.** Any value that does not match the UUID regex is discarded and a fresh UUID is generated. This is a log-injection guard, not merely a correlation convenience.
- **Locale must precede routes.** Anything downstream that resolves user-facing copy depends on the locale being already attached to the request.
