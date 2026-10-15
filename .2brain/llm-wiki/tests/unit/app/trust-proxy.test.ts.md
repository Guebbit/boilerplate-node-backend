---
source: tests/unit/app/trust-proxy.test.ts
sha256: f10dcbad484f900e6fb16fcb5036bbfbc6504bfa81c7fe39fb625964d2965f34
generated_at: 2026-10-15T13:04:13.613428+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/trust-proxy.test.ts

## Purpose

Unit test verifying the exact value `installSecurity` writes into Express's `trust proxy` setting for each value of `NODE_TRUST_PROXY_HOPS`. It exists to pin down a subtle contract: when no proxy is in front the value must be the boolean `false`, not the number `0`, because `express-rate-limit` gates its `X-Forwarded-For` warning on `=== false`.

## Key elements

- **`trustProxyFor(hops: string): unknown`** – Test helper that calls `setEnvironment` with the given `NODE_TRUST_PROXY_HOPS`, creates a fresh `express()` app, runs `installSecurity(app)`, and returns `app.get('trust proxy')`.
- **`describe('installSecurity trust proxy')`** – The test block containing two cases:
  - `"is false, not 0, when no proxy is in front"` – asserts the setting is `false` (strict equality) when the env var is `'0'`.
  - `"is the hop count when it is %s"` (parameterised over 1, 2, 3) – asserts the setting equals the numeric hop count.

## Relationships

- **`src/app/security.ts`** – Source of `installSecurity`, the function under test. This test exercises only the `trust proxy` branch of that function's setup.
- **`tests/support/environment.ts`** – Source of `setEnvironment`, used here to inject `NODE_TRUST_PROXY_HOPS` before `installSecurity` reads it. No other test-support utilities from that file are used in this file.

## Notes

- The distinction between `false` and `0` is the entire reason this file exists; a regression to `0` would silently disable `express-rate-limit`'s untrusted-proxy warning (that warning's behaviour is covered separately in `tests/integration/trust-proxy-warning.test.ts`).
- Each test case creates a **new** `express()` app rather than sharing one, so the env-var mutation from `setEnvironment` is isolated per assertion.
- The helper returns `unknown` (not a typed union) because the Express `app.get` API is loosely typed; the assertions use `toBe` to enforce strict identity.
