---
source: tests/integration/trust-proxy-warning.test.ts
sha256: e93608b77b07ab5494ff6905af6057c97e43c2d7e73d84009665d291d563d36e
generated_at: 2026-10-15T12:55:11.911101+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/trust-proxy-warning.test.ts

## Purpose

Verifies that when an `X-Forwarded-For` header arrives while `NODE_TRUST_PROXY_HOPS` is `0`, the app logs a single `error`-level warning (emitted by express-rate-limit) that names the offending header. The test guards against a silent proxy misconfiguration where all callers would share one rate-limit bucket.

## Key elements

- **`describe('a forwarded address while trust proxy is off')`** — scopes the single test case to the trust-proxy-misconfiguration scenario.
- **`it('is reported through the app logger, once, naming the header')`** — spies on `logger.error`, sends three requests (one to `/livez`, two to `/`) each carrying a spoofed `X-Forwarded-For` value, then asserts exactly one warning call exists and that its second argument contains `X-Forwarded-For`.
- **Mock-call filtering** — `error.mock.calls.filter(...)` isolates the rate-limit warning by checking the message starts with `'rate-limit: express-rate-limit'`, ignoring unrelated log output.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imports the singleton `logger` and spies on its `error` method to capture and assert the warning is routed through the app's standard logging channel (not `console`, not a separate rate-limit logger).
- **`tests/support/http.ts`** — imports `api` as the HTTP client harness used to issue requests against the running server under test.

## Notes

- express-rate-limit evaluates the trust-proxy condition **once per limiter instance** on the first request that reaches it. The test's first request is deliberately the forged one so the one-shot warning fires on it; the second and third requests confirm no duplicate is emitted.
- `/livez` and `/readyz` are exempt from the global rate-limit budget (skipped before the trust-proxy check), so a container healthcheck hitting those endpoints will never consume the single warning. The test uses `/livez` as its first call specifically to confirm this skip does **not** suppress the warning.
- The spy is restored (`error.mockRestore()`) before assertions read `mock.calls`, following the project's convention of not leaking mocks across test cases.
- See `docs/tools/security.md#trust-proxy-and-the-two-ways-to-get-it-wrong` for the two failure modes this warning covers.
