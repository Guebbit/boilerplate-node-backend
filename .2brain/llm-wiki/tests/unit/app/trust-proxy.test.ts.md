---
source: tests/unit/app/trust-proxy.test.ts
sha256: f10dcbad484f900e6fb16fcb5036bbfbc6504bfa81c7fe39fb625964d2965f34
generated_at: 2026-11-08T10:03:22.734377+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/trust-proxy.test.ts

## Purpose

Verifies the `trust proxy` value that `installSecurity` assigns to an Express app based on the `NODE_TRUST_PROXY_HOPS` environment variable. The critical assertion is that a hop count of `"0"` yields `false` (not `0`), because `express-rate-limit` distinguishes "trust proxy is off" via strict `=== false` comparison.

## Key elements

- **`trustProxyFor(hops: string): unknown`** — Test helper. Calls `setEnvironment` with `NODE_TRUST_PROXY_HOPS`, creates a fresh Express app, runs `installSecurity(app)`, and returns `app.get('trust proxy')`.
- **`describe('installSecurity trust proxy')`** — Single test suite with two cases:
  - Hop count `"0"` → result is `false` (not `0`).
  - Hop counts `"1"`, `"2"`, `"3"` → result is the corresponding number (via `it.each`).

## Relationships

- **`src/app/security.ts`** — Source of `installSecurity`, the function under test. This test asserts on the side effect `installSecurity` has on the Express app's `trust proxy` setting.
- **`tests/support/environment.ts`** — Source of `setEnvironment`, used by the helper to inject `NODE_TRUST_PROXY_HOPS` before calling `installSecurity`.

## Notes

- The `false`-vs-`0` distinction is load-bearing for `express-rate-limit`: only `=== false` triggers its "X-Forwarded-For from an uncounted proxy" warning. The warning behavior itself is covered separately in `tests/integration/trust-proxy-warning.test.ts`.
- `setEnvironment` must be called **before** `installSecurity` in each test invocation; the helper encapsulates that ordering so individual tests don't repeat it.
