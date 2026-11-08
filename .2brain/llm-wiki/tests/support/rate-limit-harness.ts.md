---
source: tests/support/rate-limit-harness.ts
sha256: dc3c13a8c7cc0206a876bdf8aefb6d7c0f8880af821ffc1588991be3fb8fa36d
generated_at: 2026-11-08T09:58:10.362383+00:00
model: ollama:qwen3.8:27b
---

# tests/support/rate-limit-harness.ts

## Purpose

A minimal Express app and module-reload utilities for driving `express-rate-limit` middleware in isolation over real HTTP. It fills the gap between the stub in `tests/support/express.ts` (no real middleware runs) and the fully mounted app in `tests/support/http.ts` (routing, auth, and serialization are irrelevant to the limiter's own behaviour).

## Key elements

- **`withReloadedRateLimits<TModule, TPicked>`** — Re-imports a rate-limit module after `jest.resetModules()` with specific environment-variable overrides (delegated to `withEnvironmentOverrides`). Necessary because `express-rate-limit` bakes its budget in at import time; the default test setup raises all budgets, so a case wanting a small one must discard the cached module and import fresh. Returns whatever the `pick` callback extracts from the new module.
- **`appAnswering(status, trustProxyHop, ...limiters)`** — Builds a single-route Express app (`POST /route`) that always responds with the given status. Applies the provided limiter chain in order, sets `trust proxy` to 1 hop when requested, and mounts `cookieParser` so cookie-based key generators work. Returns the `express.Express` instance for use with supertest.
- **`statusOf(pending)`** — Awaits a pending supertest `Test` and returns only the numeric status code, keeping call sites terse.

## Relationships

- **`tests/support/environment.ts`** — Provides `withEnvironmentOverrides`, which `withReloadedRateLimits` uses to set/restore env vars around the re-import (guaranteeing restoration even if the import throws).
- **Integration tests** (e.g. `identity-rate-limit.test.ts`, `checkout-rate-limit.test.ts`, `auth-hardening.test.ts`, `payment-velocity.test.ts`, `submission-rate-limit.test.ts`, `contact-identity-rate-limit.test.ts`, `device-cookie-budget.test.ts`, `merge-rate-limit.test.ts`, `note-rate-limit.test.ts`, `global-limit-refund.test.ts`, `auth-races.test.ts`, `refusal-request-id.test.ts`) — Consume `appAnswering` and/or `withReloadedRateLimits` to exercise a specific module's rate-limit middleware without mounting the rest of that module's routing or auth stack.
- **`tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts`** — Also pulls in this harness to test the rate-limit store middleware in isolation.

## Notes

- `express-rate-limit` reads its options **once at module construction**; without `jest.resetModules()` + re-import, you get whatever budget `setup-environment.ts` configured (intentionally high to avoid cross-suite interference).
- The `trustProxyHop` flag only matters for the **address-BLOCK** dimension of the limiter (i.e. when the key is derived from `request.ip`). It is irrelevant when the key comes from a header or cookie.
- `cookieParser` is mounted unconditionally because some key generators read a cookie; omitting it would silently change the key and break the test.
- The app has exactly one route (`POST /route`). Tests that need to verify a `429` body or header must attach their own assertions to the supertest response rather than to a second route.
