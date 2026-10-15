---
source: tests/integration/security-middleware.test.ts
sha256: bdc73ce673d42cf2e0d0b05ffe266708530bc42d622dd0e37f0a88aa7eca453d
generated_at: 2026-10-15T12:54:20.050702+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-middleware.test.ts

## Purpose

Integration test that drives the real, fully-wired application to verify security-middleware properties of `src/app/security.ts` that no other test asserts: helmet headers on API responses, trust-proxy enforcement against `X-Forwarded-For` spoofing, static-file rate-limit exemption and cache policy, and CORS header configuration.

## Key elements

- **`remainingOf(response)`** — extracts the `remaining` count from the `RateLimit` response header (`limit=…, remaining=…`).
- **`describe('helmet')`** — asserts `x-content-type-options: nosniff`, presence of `x-frame-options`, and absence of `x-powered-by` on a plain `GET /` response. Deliberately a one-case spot check, not a full header-set assertion.
- **`describe('trust proxy')`** — sends two `GET /` requests with different forged `X-Forwarded-For` values from the same socket; asserts the rate-limit `remaining` drops by exactly 1 (same bucket), proving `NODE_TRUST_PROXY_HOPS=0` is applied by the real app wiring.
- **`describe('static files')`** — creates a sandbox under `NODE_PUBLIC_PATH` in `beforeAll`, tears it down in `afterAll`. Verifies static files don't consume the caller's rate-limit budget, digested image names get `max-age=31536000, immutable`, and fixed-name assets (favicon) get `max-age=86400`.
- **`describe('CORS')`** — issues a preflight `OPTIONS /account/login` and a `GET /` with an `Origin` header; asserts `Idempotency-Key` is in allowed headers and `Retry-After` / `RateLimit-Policy` are exposed.

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` helper (supertest instance) used for every request in this file.
- **`src/infrastructure/config/store.ts`** — supplies `currentEnvironment()` to read `NODE_PUBLIC_PATH` (static-file sandbox root) and `NODE_CORS_ORIGIN` (CORS test origin).

## Notes

- The trust-proxy test *requires* the real app: a synthetic Express instance with `trust proxy` unset would pass trivially, so the meaningful assertion is that `src/app/security.ts` itself set the hop count. This distinguishes it from `identity-rate-limit.test.ts`, which tests `express-rate-limit` arithmetic in isolation.
- The helmet case intentionally avoids a full header-set snapshot to survive helmet upgrades; the static-asset path is covered separately by `upload-security.test.ts`.
- The static-files block is self-managing: it creates files in `beforeAll` and removes the entire `NODE_PUBLIC_PATH` directory in `afterAll`, so no leftover state persists between runs.
- `NODE_CORS_ORIGIN` may be a comma-separated list; the test takes only the first entry.
