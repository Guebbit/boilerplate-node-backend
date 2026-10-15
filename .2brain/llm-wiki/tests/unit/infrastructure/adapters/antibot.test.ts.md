---
source: tests/unit/infrastructure/adapters/antibot.test.ts
sha256: 79ffc53964f31ba7a5fc20ee80b58f6d8b635176928c0c47f82ef8f572953058
generated_at: 2026-10-15T13:04:45.888722+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot.test.ts

## Purpose

Unit tests for the `checkEmailPolicy` resolver in `antibot.ts`, verifying all three postures (off-by-default, `disposable`, `mx`) and the allow/deny override lists. The `node:dns/promises` module is fully mocked so the suite stays hermetic — no real DNS lookups occur.

## Key elements

- **`checkEmailPolicy`** (imported from the adapter) — the function under test; returns `'ok'` or `'refused'` based on the active policy posture.
- **`mockedResolveMx`** — a `jest.fn()` standing in for `Resolver#resolveMx`; configured per-test to simulate empty results, NXDOMAIN, or a real MX record.
- **`jest.mock('node:dns/promises')`** — factory mock that exposes a `resolverOptions` array (captured from the `Resolver` constructor) and a `Resolver` class whose `resolveMx` delegates to `mockedResolveMx`.
- **`setEnvironment`** (from `@tests/environment`) — helper that sets/clears `NODE_ANTIBOT_*` env vars for each test and restores them afterward.
- **`describe('checkEmailPolicy')`** — covers default-off, unrecognised-policy error, `disposable` (blocklist, allowlist override, extra-denylist, no DNS check), and `mx` (short-circuit on known disposable, empty MX, lookup failure, valid MX).
- **`describe('the MX lookup')`** — asserts the `Resolver` was constructed with `{ timeout: 2000, tries: 1 }`.

## Relationships

- **`src/infrastructure/adapters/antibot.ts`** — the module under test; this file imports `checkEmailPolicy` from it and asserts its behavior across all postures and override variables.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in every test to control `NODE_ANTIBOT_EMAIL_POLICY`, `NODE_ANTIBOT_EMAIL_ALLOWLIST`, and `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA`.

## Notes

- The adapter constructs its `Resolver` at **import time**, before the test file's `const`s exist. The mock therefore captures constructor arguments into a module-level array and exposes them via `jest.requireMock` rather than a local variable.
- `beforeEach` in the `checkEmailPolicy` suite sets `mockedResolveMx` to reject by default, so any accidental DNS call outside the `mx` policy tests fails loudly instead of passing silently.
- No memoisation/registry reset is needed here (unlike the payment/analytics adapter tests); the policy is read fresh from the environment on each call.
- The `disposable` policy is explicitly tested to **not** perform any MX lookup — a nonexistent domain still resolves `'ok'` under that posture.
