---
source: tests/unit/scenarios/no-human-challenge.test.ts
sha256: 565e0a52d666bafa766d345a11f8d50b7aaab0f0d7cea2f61fd9cb818bac5ec7
generated_at: 2026-10-15T13:24:21.206313+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/no-human-challenge.test.ts

## Purpose

Unit tests for the `withoutHumanChallenge` helper: verifies that it temporarily disables the human-challenge (antibot) gate for the duration of a supplied async function and then restores the previous state — including edge cases like a failing callback and an unset provider.

## Key elements

- **`beforeEach` block** — sets `NODE_ANTIBOT_PROVIDER` to `'altcha'` and provides a test signing secret so every test starts from a known "challenge enabled" baseline.
- **`describe('withoutHumanChallenge')`** — the single test suite containing four cases:
  - *Turns the gate off for the work, and back on after it* — asserts `isHumanChallengeEnabled()` is `true` → `false` inside → `true` after.
  - *Resolves to what the work resolved to* — confirms the helper is transparent: the inner promise value passes through unchanged.
  - *Restores the provider when the work fails, and lets the failure through* — ensures a rejection propagates **and** the env is still reset to `'altcha'`.
  - *Leaves an unset provider unset, not the string "undefined"* — guards against a serialization bug where `undefined` becomes the literal string `"undefined"` in the config store.

## Relationships

- **`scenarios/support/no-human-challenge.ts`** — the system under test; exports `withoutHumanChallenge`, the wrapper being exercised here.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** — exports `isHumanChallengeEnabled`, the real gate the tests assert against (rather than checking the raw env variable).
- **`src/infrastructure/config/store.ts`** — exports `currentEnvironment`, used to inspect the config store after restoration.
- **`tests/support/environment.ts`** — exports `setEnvironment`, used in `beforeEach` and in the "unset provider" test to control env state.

## Notes

- Tests assert against `isHumanChallengeEnabled()` (the production gate) rather than the underlying `NODE_ANTIBOT_PROVIDER` variable, deliberately testing the contract the app sees.
- The "unset" test uses the `'NODE_ANTIBOT_PROVIDER' in currentEnvironment()` idiom to distinguish a truly absent key from one set to the string `"undefined"`.
- The file header comment documents intent at the module level; the `@module` JSDoc tag signals it is a side-effect-only test file with no exports of its own.
