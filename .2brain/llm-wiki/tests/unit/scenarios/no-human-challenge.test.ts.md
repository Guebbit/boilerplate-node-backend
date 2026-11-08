---
source: tests/unit/scenarios/no-human-challenge.test.ts
sha256: 565e0a52d666bafa766d345a11f8d50b7aaab0f0d7cea2f61fd9cb818bac5ec7
generated_at: 2026-11-08T10:29:53.085393+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/no-human-challenge.test.ts

## Purpose

Unit tests for the `withoutHumanChallenge` scenario helper. Verifies that the helper temporarily disables the human-challenge (antibot) gate for the duration of a synchronous or async callback, then restores the original configuration—including edge cases like a failure inside the callback or an originally-unset provider key.

## Key elements

- **`beforeEach`** — Seeds the config store with `NODE_ANTIBOT_PROVIDER: 'altcha'` and a dummy `NODE_ANTIBOT_ALTCHA_SECRET` so every test starts from a known "gate on" state.
- **`describe('withoutHumanChallenge')`** — Four test cases:
  - *Gate off during work, on after* — Calls `withoutHumanChallenge` with a callback that reads `isHumanChallengeEnabled()`; asserts the gate is `false` inside and `true` after.
  - *Resolves to work's value* — Confirms the helper is pass-through: the promise resolves to whatever the inner work resolves to (`'built'`).
  - *Restores on failure* — A rejecting callback still restores `NODE_ANTIBOT_PROVIDER` to `'altcha'` and re-throws the original error.
  - *Unset stays unset* — If `NODE_ANTIBOT_PROVIDER` was `undefined` before the call, the key is absent from `currentEnvironment()` afterward (not the string `"undefined"`).

## Relationships

- **`scenarios/support/no-human-challenge.ts`** — Source of the `withoutHumanChallenge` helper under test; this file exercises its contract.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** — Provides `isHumanChallengeEnabled`, the real gate the tests assert against (rather than peeking at the raw config variable).
- **`src/infrastructure/config/store.ts`** — Provides `currentEnvironment`, used in the failure and unset-provider tests to inspect the restored config state.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used in `beforeEach` and the unset-provider test to configure/override the test config store.

## Notes

- The doc comment at the top of the file (borrowed from the support module) makes the intent explicit: assertions target the *gate* (`isHumanChallengeEnabled`), not the underlying environment variable. If the provider abstraction changes, these tests still validate the behavioral contract.
- The fourth test guards against a specific bug: `setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined })` must delete the key, not set it to the string `"undefined"`. The helper is expected to preserve that distinction on restore.
