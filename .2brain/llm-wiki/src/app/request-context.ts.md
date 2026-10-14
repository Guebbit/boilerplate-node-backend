---
source: src/app/request-context.ts
sha256: 4adf6cd19ef036d3e485de60f886f3e61493e30ae111ea5a07fa5ec1469da493
generated_at: 2026-10-14T07:38:28.648734+00:00
model: ollama:qwen3.8:27b
---

# src/app/request-context.ts

## Purpose

Sets up per-request context that the rest of the request pipeline reads: the access log, the observability trace handle, the negotiated locale, and the canonical request ID. It must be mounted before the routes (and, for the request ID, before security/rate-limiting middleware) so that every downstream handler—including rejected ones—can log and correlate against these values.

## Key elements

- **`REQUEST_ID_PATTERN`** — Regex that matches a canonical RFC 4122 UUID (any version/variant). Used to validate a client-supplied `x-request-id` before it is allowed into logs and audit entries, preventing log-injection.
- **`requestIdMiddleware: RequestHandler`** — Assigns `request.requestId` (always a service-chosen UUID unless a trusted ingress vouches for the header) and `request.clientRequestId` (the validated caller-supplied UUID, if any). Sets the `x-request-id` response header. Designed to be mounted before rate-limiting so even refused requests carry the header.
- **`installRequestContext(app: Express): void`** — Registers `requestLogger` (Winston access log + OpenTelemetry trace injection) and then `attachLocale` (Accept-Language negotiation) on the Express app. Must run before route registration.

## Relationships

- **`src/app.ts`** — Consumes `requestIdMiddleware` and `installRequestContext` to wire them into the Express app in the correct mount order (request ID first, then security, then `installRequestContext`, then routes).
- **`src/infrastructure/http/middlewares/request-logger.ts`** — Provides the `requestLogger` middleware that `installRequestContext` registers.
- **`src/infrastructure/http/middlewares/locale.ts`** — Provides `attachLocale`, registered by `installRequestContext` for locale negotiation.
- **`src/infrastructure/runtime/config.ts`** — Exposes `tracingConfig()`, from which `requestIdMiddleware` reads the `NODE_TRUSTED_INGRESS` flag to decide whether to trust the caller's `x-request-id`.
- **`tests/integration/refusal-request-id.test.ts`** — Verifies that refused (rate-limited) responses still carry a valid `x-request-id` header, exercising `requestIdMiddleware`'s early-mount guarantee.
- **`tests/integration/scenarios/demo-routes.test.ts`** — Integration tests that exercise routes after the request context (logging, locale, request ID) is installed.

## Notes

- Mount order matters: `requestIdMiddleware` is intentionally mounted **before** `installSecurity` (the global rate limiter) so that a 429 response still includes `x-request-id` in the response header and in the access log. `installRequestContext` is mounted after security but before routes.
- A client-supplied `x-request-id` is **never** used as `request.requestId` unless `NODE_TRUSTED_INGRESS` is set. In the untrusted case it is stored only as `request.clientRequestId` (logged as `clientRequestId`, mirroring AWS ALB convention), and a fresh `crypto.randomUUID()` is assigned.
- The UUID regex is strict (lowercase hex, fixed 8-4-4-4-12 shape). Any header that fails the check is treated as absent—no partial validation.
