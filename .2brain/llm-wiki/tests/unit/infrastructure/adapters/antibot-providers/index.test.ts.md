---
source: tests/unit/infrastructure/adapters/antibot-providers/index.test.ts
sha256: 35467e13ad7530fe70b3c556008b5205f0f2dbb48d7e15d9d1971aefa4af400d
generated_at: 2026-11-08T10:05:22.909574+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot-providers/index.test.ts

## Purpose

Unit tests for the antibot-provider selection factory and the built-in no-op (`none`) provider. The suite encodes the port's contract: default off, explicit opt-in by name, and a hard throw (not a silent fallback) on an unrecognized provider name.

## Key elements

- **`describe('resolveHumanChallengeProvider')`** — three cases covering the factory's three outcomes:
  - *Defaults to `none`* — when `NODE_ANTIBOT_PROVIDER` is unset, the returned provider is named `'none'` and `isHumanChallengeEnabled()` is `false`.
  - *Selects the named implementation* — setting the env to `'turnstile'` yields a provider named `'turnstile'` with `isHumanChallengeEnabled()` `true`.
  - *Throws on unknown name* — an unrecognized value (`'recaptcha'`) causes `resolveHumanChallengeProvider()` to throw a message containing `'Unknown NODE_ANTIBOT_PROVIDER'`.
- **`describe('the `none` provider')`** — verifies the no-op provider's behavior: `publicParameters(anyPath)` returns `{}` and `verify(anything)` resolves to `'ok'`.
- **`setEnvironment`** (from test support) — sets `NODE_ANTIBOT_PROVIDER` per test case so each case is isolated.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — the module under test; the suite imports `resolveHumanChallengeProvider` and `isHumanChallengeEnabled` from it.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to control `NODE_ANTIBOT_PROVIDER` without mutating real `process.env` globally.

## Notes

- The design intent (stated in the module doc block) is that a typo in the deployment config must **throw at startup**, not silently disable the antibot rung. The `'recaptcha'` test case guards that specific invariant.
- `setEnvironment` is called at the top of each `it` block; the support helper is responsible for restoring prior values so other suites are unaffected.
- The `none` provider's `verify` resolving to the string `'ok'` is the contract callers rely on — it is not `null` or a token.
