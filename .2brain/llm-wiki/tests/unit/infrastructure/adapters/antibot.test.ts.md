---
source: tests/unit/infrastructure/adapters/antibot.test.ts
sha256: 9aefc5bf8326a59d59c8212a9734d3a38c626ac7cc10d5291a13a68e45504e25
generated_at: 2026-09-27T16:02:49.207135+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot.test.ts

## Purpose

Unit tests for the `checkEmailPolicy` resolver in the anti-bot email adapter. Covers all three postures (disabled/default, `disposable`, `mx`), env-var overrides (allowlist, extra denylist), and the bounded MX lookup behavior, while keeping the suite fully hermetic by mocking DNS.

## Key elements

- **`mockedResolveMx`** — `jest.fn()` that stands in for `Resolver.resolveMx`; each `mx`-policy test wires a specific resolved/rejected value.
- **`jest.mock('node:dns/promises', …)`** — Factory mock that exposes a `resolverOptions` array (captures the constructor args the adapter passes) and a `Resolver` class whose `resolveMx` delegates to `mockedResolveMx`.
- **`restoreEnv(key, value)`** — Helper that restores an env var to its pre-test value or deletes it if it was originally absent.
- **`describe('checkEmailPolicy', …)`** — Top-level suite. Saves original values of `NODE_ANTIBOT_EMAIL_POLICY`, `NODE_ANTIBOT_EMAIL_DENYLIST_EXTRA`, and `NODE_ANTIBOT_EMAIL_ALLOWLIST`; restores them (plus resets the mock) in `afterEach`.
  - *Default posture*: policy unset → known disposable domain still resolves `'ok'`.
  - *Unrecognised policy name*: rejects with an error mentioning `NODE_ANTIBOT_EMAIL_POLICY`.
  - *`disposable`*: blocklist hit → `'refused'`; normal domain → `'ok'`; allowlist override wins; extra-denylist alone refuses; no MX check is performed.
  - *`mx`*: blocklisted domain short-circuits (no DNS call); empty MX response → `'refused'`; lookup rejection (ENOTFOUND) → `'refused'`; valid MX record → `'ok'`.
- **`describe('the MX lookup', …)`** — Verifies the adapter constructed its `Resolver` with `{ timeout: 2000, tries: 1 }`, read back via `jest.requireMock`.

## Relationships

- **`src/infrastructure/adapters/antibot.ts`** — The module under test. The test imports `checkEmailPolicy` from it and mocks the `node:dns/promises` dependency that the adapter uses internally to build its DNS `Resolver`.

## Notes

- The adapter builds its resolver at **import time**, before the test file's own `const`s exist. The mock factory therefore stores constructor options in a closure-local array, which the test reads via `jest.requireMock` rather than a direct import.
- Unlike the payment/analytics provider registries, there is **no memoisation** to reset here; the policy is read from `process.env` on every call, so restoring the three env vars in `afterEach` is sufficient.
- `beforeEach` pre-sets `mockedResolveMx` to *reject* by default, so any accidental DNS call in a non-`mx` test fails loudly rather than silently passing.
