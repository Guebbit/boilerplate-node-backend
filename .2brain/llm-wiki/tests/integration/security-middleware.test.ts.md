---
source: tests/integration/security-middleware.test.ts
sha256: 35982e2e2b2aa580f42599098c398e43dece7dbf5ddd0666b121901c1ede3d6d
generated_at: 2026-09-27T15:58:52.233504+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-middleware.test.ts

## Purpose

Integration tests that verify `src/app/security.ts` behaves correctly end-to-end: helmet security headers appear on ordinary API responses, a forged `X-Forwarded-For` cannot create a fresh rate-limit bucket when `NODE_TRUST_PROXY_HOPS=0`, static assets are exempt from the global rate limiter and carry correct cache-control values, and CORS is configured to let browsers send `Idempotency-Key` and read rate-limit headers.

## Key elements

- **`remainingOf(response)`** — Extracts the `remaining` value from the draft-7 `RateLimit` header (`limit=…, remaining=…`).
- **`describe('helmet')`** — Single test: asserts `X-Content-Type-Options: nosniff`, presence of `X-Frame-Options`, and absence of `X-Powered-By` on a plain `GET /` JSON response. Deliberately avoids a full header-set assertion to stay resilient across helmet upgrades.
- **`describe('trust proxy')`** — Sends two `GET /` requests with different forged `X-Forwarded-For` values and asserts `RateLimit-Remaining` drops by exactly 1, proving both hit the same bucket keyed on the real socket IP.
- **`describe('static files')`** — Creates a sandbox directory under `NODE_PUBLIC_PATH`, then verifies: (a) static assets don't consume the caller's rate-limit budget, (b) digested images get `max-age=31536000, immutable`, (c) fixed-name assets (favicon) get `max-age=86400`.
- **`describe('CORS')`** — Preflight (`OPTIONS /account/login`) confirms `Idempotency-Key` is in `Access-Control-Allow-Headers`; a subsequent `GET /` confirms `Retry-After` and `RateLimit-Policy` are in `Access-Control-Expose-Headers`.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` helper (imported via `@tests/http`). Every request in this file goes through it to drive the fully-wired real Express app, as opposed to a synthetic harness.

## Notes

- The trust-proxy test **must** use the real app, not a narrower Express harness. A synthetic app with Express's default `trust proxy` unset would pass regardless of whether `src/app/security.ts` actually applied `NODE_TRUST_PROXY_HOPS`. The point is proving this repo's own wiring.
- `NODE_TRUST_PROXY_HOPS=0` is both the test and production default; it means Express never reads `X-Forwarded-For`.
- The helmet test targets the **JSON API path** only. The static-asset path (with a relaxed `Cross-Origin-Resource-Policy`) is covered separately in `upload-security.test.ts`.
- The static-files sandbox (`tests/support/file-sandbox.ts`) is created in `beforeAll` and removed in `afterAll`; it is empty until these tests populate it.
- See `docs/tools/security.md` for the broader security model these tests pin down.
