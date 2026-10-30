---
source: tests/integration/security-middleware.test.ts
sha256: b4a5d9f2616a0eacaaaf6f94ab6763462a22c9171b9b5010027ec63e6e35f285
generated_at: 2026-10-29T07:03:35.491217+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-middleware.test.ts

## Purpose

Integration tests that exercise the real, fully-wired app to verify four security-middleware properties that no other test asserts: helmet headers on ordinary API responses, `NODE_TRUST_PROXY_HOPS=0` preventing `X-Forwarded-For` spoofing from minting fresh rate-limit buckets, static-asset cache/billing behavior, and CORS header configuration. The emphasis is on proving `src/app/security.ts` itself applied its configuration, which only the real app (not a synthetic harness) can demonstrate.

## Key elements

- **`remainingOf(response)`** — extracts the integer `r` value from the draft-11 `RateLimit` header (`"global";r=…;t=…`) for budget assertions.
- **`describe('helmet')`** — one assertion set on a plain `GET /` response: `x-content-type-options`, presence of `x-frame-options`, absence of `x-powered-by`. Deliberately *not* a full header enumeration.
- **`describe('trust proxy')`** — sends two requests with different forged `X-Forwarded-For` values from one socket; asserts `remaining` drops by exactly 1 (same bucket) rather than resetting.
- **`describe('static files')`** — sets up files in the `NODE_PUBLIC_PATH` sandbox; asserts static hits don't consume the caller's rate-limit budget and that digested vs. fixed-name assets get `max-age=31536000, immutable` vs. `max-age=86400` respectively.
- **`describe('CORS')`** — preflight + simple-request checks that `idempotency-key` is allowed and `Retry-After` / `RateLimit-Policy` are exposed to browsers.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` test client; every request in this file goes through it to hit the real running app.
- **`src/infrastructure/config/store.ts`** — provides `currentEnvironment()`; read for `NODE_PUBLIC_PATH` (static-file sandbox root) and `NODE_CORS_ORIGIN` (CORS test origin).

## Notes

- The file intentionally drives the **real app** rather than building a narrower Express instance. A synthetic app with Express's default (`trust proxy` unset) would pass the trust-proxy test regardless of whether `src/app/security.ts` ran its configuration.
- The helmet case is deliberately minimal to avoid coupling to helmet's full header list; `upload-security.test.ts` covers the static-asset path (different `Cross-Origin-Resource-Policy`).
- Static-file tests depend on `tests/support/file-sandbox.ts` (referenced in a comment) for the `NODE_PUBLIC_PATH` directory; the `afterAll` tears it down with `rm(…recursive, force)`.
- Broader context lives in `docs/tools/security.md` (linked in the file's doc comment).
