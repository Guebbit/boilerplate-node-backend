---
source: scenarios/support/no-human-challenge.ts
sha256: feb4592c7ed37cdf0de4bf86e32b5e8f01937c4c69bbc9dc341430871f907373
generated_at: 2026-10-14T07:05:42.173959+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/no-human-challenge.ts

## Purpose

Provides a scoped context manager that disables the antibot (human-challenge) provider for the duration of a shop build, so the flow runner can complete a real-HTTP login and payment without being refused on the first challenge. The provider is restored to its original state (including an unset value) when the build finishes.

## Key elements

- **`PROVIDER_VARIABLE`** – Module-private constant (`'NODE_ANTIBOT_PROVIDER'`) naming the environment variable the config store reads to select the antibot provider.
- **`withoutHumanChallenge(work)`** – The sole export. A generic async wrapper (`<T>(work: () => Promise<T>) => Promise<T>`) that calls `overrideEnvironment` to set the provider to `'none'`, executes `work`, and runs the returned `restore` in a `.finally` clause, guaranteeing cleanup even on rejection.

## Relationships

- **`src/infrastructure/config/store.ts`** – Supplies `overrideEnvironment`, the mechanism this module uses to swap the provider variable without mutating `process.env` directly. The config store reads the process environment once, so a raw env write would not take effect; the override is the correct channel.
- **`scenarios/index.ts`** – Aggregates scenario helpers; this module is the "provider off" building block that scenario scripts compose around the build.
- **`tests/unit/scenarios/no-human-challenge.test.ts`** – Unit tests that exercise `withoutHumanChallenge`'s happy path and rejection-pass-through-then-restore behavior.

## Notes

- The override is applied **before** the build starts and restored **after** it ends (`.finally`). A process that boots with the provider on (e.g., the paired antibot suite) still serves challenges on its listening phase because the build completes before the server begins accepting connections.
- Do not replace `overrideEnvironment` with a direct `process.env` assignment; the config store caches the initial environment read, so a late env mutation is invisible to it.
- The generic signature means callers get their resolved value typed; a thrown/rejected `work` still triggers the restore before the rejection propagates.
