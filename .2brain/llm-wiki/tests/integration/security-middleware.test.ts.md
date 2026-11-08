---
source: tests/integration/security-middleware.test.ts
sha256: b4a5d9f2616a0eacaaaf6f94ab6763462a22c9171b9b5010027ec63e6e35f285
generated_at: 2026-11-08T09:48:40.691839+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-middleware.test.ts

## Purpose

Integration tests for security properties configured in `src/app/security.ts` that no other test file asserts: helmet headers on the ordinary API path, resistance to `X-Forwarded-For` spoofing under the repo's `NODE_TRUST_PROXY_HOPS=0` default, static-file exclusion from rate limiting and their cache headers, and CORS exposure of rate-limit/retry headers.

## Key elements

- **`remainingOf(response)`** — helper that extracts the `remaining` value from the draft-11 `RateLimit` header (`"global";r=…;t=…`).
- **`describe('helmet')`** — single test asserting `x-content-type-options: nosniff`, presence of `x-frame-options`, and absence of `x-powered-by` on a plain `GET /`. Deliberately minimal to survive helmet upgrades.
- **`describe('trust proxy')`** — sends two `GET /` requests with different forged `X-Forwarded-For` values and asserts the global rate-limit `remaining` drops by exactly 1, proving both consumed the same bucket keyed on the real socket address.
- **`describe('static files')`** — seeds a sandbox directory (`images/digested.png`, `favicon/icon.png`), then verifies: (1) a static fetch does not decrement the caller's budget, (2) digested images get `max-age=31536000, immutable`, (3) fixed-name assets get `max-age=86400`. Tears down the sandbox in `afterAll`.
- **`describe('CORS')`** — preflight + simple-request pair confirming `Idempotency-Key` is allowed in requests and `Retry-After` / `RateLimit-Policy` are exposed in responses.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` helper used by every test to drive the fully-wired application (real Express app, not a synthetic harness).
- **`src/infrastructure/config/store.ts`** — supplies `currentEnvironment()`, from which this file reads `NODE_PUBLIC_PATH` (sandbox root for static-file tests) and `NODE_CORS_ORIGIN` (allowed origin for the CORS preflight).

## Notes

- The trust-proxy test intentionally drives the **real** app. A synthetic Express instance with `trust proxy` unset would pass regardless of whether `src/app/security.ts` ran, so only the full app proves the wiring.
- This file is the counterpart to `identity-rate-limit.test.ts`: that file tests `express-rate-limit`'s internal bucket arithmetic against a trivial harness; this file tests that the repo's code *applied* the config correctly.
- The helmet test asserts only a subset of headers on the API path. The static-asset path is covered separately in `upload-security.test.ts`, which configures a deliberately different `Cross-Origin-Resource-Policy`.
- The `static files` block depends on `tests/support/file-sandbox.ts` to create/tear down `NODE_PUBLIC_PATH`; the directory is empty until `beforeAll` populates it and is removed in `afterAll`.
