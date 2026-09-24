---
source: tests/unit/infrastructure/adapters/antibot-providers/index.test.ts
sha256: e16d13d9da2f456f7ca52409cf286485987b93bbe9c71219954a3f4b44e66227
generated_at: 2026-09-23T20:16:11.090474+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot-providers/index.test.ts

## Purpose

Unit tests for the antibot provider selection logic. They verify the port's three selection rules—default to the no-op provider, pick a named implementation when the environment names one, and throw (not silently fall back) on an unrecognized name—plus the behavioral contract of the `none` provider itself.

## Key elements

- **`ORIGINAL` / `afterEach`** – Captures and restores `process.env.NODE_ANTIBOT_PROVIDER` so no test leaks its env mutation into another suite.
- **`describe('resolveHumanChallengeProvider')`** – Three cases:
  - *default*: no env var → provider named `'none'`, `isHumanChallengeEnabled()` is `false`.
  - *named*: env var set to `'turnstile'` → provider named `'turnstile'`, enabled is `true`.
  - *unknown*: env var set to `'recaptcha'` → throws with message containing `'Unknown NODE_ANTIBOT_PROVIDER'`.
- **`describe('the `none` provider')`** – Confirms the no-op provider's `publicParameters(url)` returns `{}` and its `verify(token)` resolves to `'ok'` regardless of input.

## Relationships

- **Imports** `isHumanChallengeEnabled` and `resolveHumanChallengeProvider` from `src/infrastructure/adapters/antibot-providers/index.ts`, which is the module under test.

## Notes

- The design intent (stated in the module docstring) is deliberate: a typo in `NODE_ANTIBOT_PROVIDER` must **throw** at bootstrap rather than silently disabling the anti-bot rung. The third test in `resolveHumanChallengeProvider` guards exactly this.
- The `none` provider is a pass-through: it never blocks and renders nothing. Tests treat `'ok'` as the universal verify result for that provider.
- Env var is `NODE_ANTIBOT_PROVIDER` (Node.js-style prefix); tests mutate it directly and rely on the `afterEach` cleanup—no mocking framework is used.
