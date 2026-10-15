---
source: tests/support/rate-limit-harness.ts
sha256: 4e05888aa08bd25a936dd5dafcdbb8941e59a6f3b26aa27d935979922585150b
generated_at: 2026-10-15T13:00:02.721343+00:00
model: ollama:qwen3.8:27b
---

# tests/support/rate-limit-harness.ts

## Purpose

Provides a minimal Express app and a module-reload helper for driving `express-rate-limit` middleware over real HTTP in isolation. It exists because neither `tests/support/express.ts` (no real middleware runs) nor `tests/support/http.ts` (routing, auth, and serialization are irrelevant to the property under test) fits the need for testing a limiter's behaviour as a property of `express-rate-limit`'s own middleware.

## Key elements

- **`withReloadedRateLimits<TModule, TPicked>`** — Discards the Jest module registry, re-imports a rate-limit module with given environment-variable overrides in place, and hands the fresh module to a `pick` function. This is necessary because `express-rate-limit` reads its options once at construction, so a limiter's budget is fixed at first import.
- **`appAnswering(status, trustProxyHop, ...limiters)`** — Builds a trivial Express app with a single `POST /route` that always returns the given status, applying the provided limiter chain before the handler. Optionally sets `trust proxy` to 1 and installs `cookie-parser` so key generators that read cookies work as in the real app.
- **`statusOf(pending)`** — Awaits a pending supertest request and returns only its numeric status code, keeping test assertions focused on the limiter's response.

## Relationships

- **`tests/support/environment.ts`** — Supplies `withEnvironmentOverrides`, which `withReloadedRateLimits` uses to set and reliably restore environment variables around the dynamic import (restores even if the import throws).
- **Consumer integration tests** (e.g. `identity-rate-limit.test.ts`, `checkout-rate-limit.test.ts`, `payment-velocity.test.ts`, `auth-races.test.ts`, `refusal-request-id.test.ts`, and others listed in the graph) — Import the three exports to spin up an isolated limiter app and assert status codes under concurrency or sequential request patterns.

## Notes

- `withReloadedRateLimits` calls `jest.resetModules()` *inside* the `withEnvironmentOverrides` callback, so the env vars are live during the import but restored before the test continues. A leaked variable would surface in a later case, not the one that set it.
- `trustProxyHop` exists specifically for the address-BLOCK dimension (IP-based limiting); it mirrors `NODE_TRUST_PROXY_HOPS` in production. Key-generation via cookies does not need it.
- The file is classified as an integration concern by the `no-restricted-imports` lint rule, meaning modules that import it are expected to live under a `tests/integration/` path.
