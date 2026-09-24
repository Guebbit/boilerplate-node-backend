---
source: tests/integration/security-middleware.test.ts
sha256: e57efe4017d9209e6343b1dc83219b952a1bd290eb4003fb2b28cf5f6aac020e
generated_at: 2026-09-23T20:07:21.284432+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-middleware.test.ts

## Purpose

Integration test that verifies two security behaviors of `src/app/security.ts` which no other test asserts: that helmet headers reach an ordinary (non-static) API response, and that a spoofed `X-Forwarded-For` header cannot obtain a fresh rate-limit bucket when `NODE_TRUST_PROXY_HOPS=0` (the deployment default). Both tests drive the fully-wired real app.

## Key elements

- **`describe('helmet')`** — One test (`GET /`) that asserts three specific header properties: `x-content-type-options: nosniff` is present, `x-frame-options` is set, and `x-powered-by` is absent. Deliberately a targeted subset, not a full header-set snapshot.
- **`describe('trust proxy')`** — One test that sends two `GET /` requests with different forged `X-Forwarded-For` values and asserts `RateLimit-Remaining` drops by exactly 1 between them, proving both requests consumed the same bucket keyed on the real socket address.
- **`api()` helper** (imported from `@tests/http`) — Constructs a Supertest instance against the real app; the sole HTTP entry point in this file.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` function used by both tests to issue requests against the fully-wired Express app. No other file is imported directly; `src/app/security.ts` is the unit under test but is exercised only through the running app, not by importing it.
- Contrast with `identity-rate-limit.test.ts` — that file tests `express-rate-limit`'s own bucket arithmetic via a trivial harness; this file tests that `src/app/security.ts` actually applied `NODE_TRUST_PROXY_HOPS` to the real middleware chain.
- Contrast with `upload-security.test.ts` — that file covers the static-asset path (configured by `src/app/static-assets.ts` with a relaxed `Cross-Origin-Resource-Policy`); this file covers the ordinary JSON API path.

## Notes

- The helmet test intentionally checks only a few headers to avoid brittleness across helmet upgrades; it is not a regression snapshot.
- The trust-proxy test relies on `NODE_TRUST_PROXY_HOPS=0` being the default in both test and production environments. A synthetic Express app with `trust proxy` unset would pass this test even if `src/app/security.ts` never ran, which is why the test drives the real app rather than building a minimal harness.
- The `RateLimit-Remaining` header is the observation point: the global `rateLimiter` (referenced at `src/app/security.ts:207`) is mounted ahead of every route and keys its bucket on `request.ip` with no per-route override, so the header is a direct read of what Express resolved `request.ip` to.
