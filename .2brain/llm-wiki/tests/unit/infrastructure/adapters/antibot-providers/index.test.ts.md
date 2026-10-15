---
source: tests/unit/infrastructure/adapters/antibot-providers/index.test.ts
sha256: 35467e13ad7530fe70b3c556008b5205f0f2dbb48d7e15d9d1971aefa4af400d
generated_at: 2026-10-15T13:04:36.585868+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot-providers/index.test.ts

## Purpose

Unit tests for the antibot-providers adapter's provider-selection logic. The file locks in three contract rules: the default is a no-op (`none`) provider, a named provider is selected when the environment configures one, and an unknown name throws rather than silently degrading to the no-op — preventing a typo in a deployment from quietly disabling the challenge rung.

## Key elements

- **`describe('resolveHumanChallengeProvider')`** — three cases covering the selection contract:
  - No `NODE_ANTIBOT_PROVIDER` → provider name is `'none'`, `isHumanChallengeEnabled()` is `false`.
  - `NODE_ANTIBOT_PROVIDER: 'turnstile'` → provider name is `'turnstile'`, enabled.
  - `NODE_ANTIBOT_PROVIDER: 'recaptcha'` (unknown) → throws with message containing `'Unknown NODE_ANTIBOT_PROVIDER'`.
- **`describe('the `none` provider')`** — verifies the no-op provider's public surface: `publicParameters('/antibot/challenge')` returns `{}` and `verify('anything')` resolves to `'ok'`.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — the module under test. This file imports `resolveHumanChallengeProvider` and `isHumanChallengeEnabled` from it.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to stub `NODE_ANTIBOT_PROVIDER` per test case. The file's comment notes the saved environment is restored for every other suite.

## Notes

- The central invariant is *fail-loud on unknown names*: the test asserts a throw, not a fallback. Changing this to a silent default would break the `toThrow` expectation.
- Each test case calls `setEnvironment` with a single key; the helper presumably isolates and restores the full environment between suites (see the saved-reference comment).
