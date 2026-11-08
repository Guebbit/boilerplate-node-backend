---
source: tests/integration/trust-proxy-warning.test.ts
sha256: e93608b77b07ab5494ff6905af6057c97e43c2d7e73d84009665d291d563d36e
generated_at: 2026-11-08T09:49:51.662261+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/trust-proxy-warning.test.ts

## Purpose

Integration test that verifies the app logs a single `logger.error` warning when an `X-Forwarded-For` header arrives while `NODE_TRUST_PROXY_HOPS` is `0` — the specific misconfiguration where a proxy exists but isn't accounted for, causing all callers to share one rate-limit bucket. The warning originates from `express-rate-limit` itself; this test confirms the app surfaces it exactly once and that the message names the header.

## Key elements

- **`describe('a forwarded address while trust proxy is off')`** — single test suite covering the trust-proxy misconfiguration path.
- **`it('is reported through the app logger, once, naming the header')`** — spies on `logger.error`, sends three `GET` requests (`/livez` with a forged `X-Forwarded-For`, then `/` twice with different forged values), then asserts exactly one call matching the `rate-limit: express-rate-limit` prefix and that its argument contains `X-Forwarded-For`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imported as `logger`; the test spies on its `error` method to capture and assert the rate-limit warning.
- **`tests/support/http.ts`** — imported as `api`; provides the HTTP client used to issue the three requests against the running server.

## Notes

- The `/livez` request is intentionally included: per the doc-block, probe endpoints are skipped by the global rate-limit budget *before* the trust-proxy check fires, so a container healthcheck never consumes the one-shot check. The first request that actually triggers the check is the subsequent `GET /`.
- `express-rate-limit` performs the trust-proxy check **once per limiter instance** on the first qualifying request. The test sends multiple requests with different `X-Forwarded-For` values to confirm the warning is emitted only once, not per request.
- The spy filter (`message.startsWith('rate-limit: express-rate-limit')`) isolates this specific warning from any other `logger.error` calls the server might emit during the test.
