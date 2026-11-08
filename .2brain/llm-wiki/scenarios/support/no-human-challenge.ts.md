---
source: scenarios/support/no-human-challenge.ts
sha256: feb4592c7ed37cdf0de4bf86e32b5e8f01937c4c69bbc9dc341430871f907373
generated_at: 2026-11-08T02:35:16.014876+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/no-human-challenge.ts

## Purpose

A small async wrapper that temporarily sets the antibot/human-challenge provider to `none` for the duration of a build, then restores the previous value. It exists so the paired scenario (flow runner signing in and paying over real HTTP) can proceed without a challenge provider refusing the first login and preventing the shop from being built.

## Key elements

- **`PROVIDER_VARIABLE`** (constant) — The environment variable name (`NODE_ANTIBOT_PROVIDER`) that selects the antibot provider.
- **`withoutHumanChallenge<T>(work: () => Promise<T>): Promise<T>`** (exported) — Runs `work` with the provider override in place. Calls `overrideEnvironment` to set the variable to `'none'`, returns `work().finally(restore)`. Rejections from `work` pass through after the restore is applied.

## Relationships

- **`src/infrastructure/config/store.ts`** — Provides `overrideEnvironment`, the mechanism this file uses to set and later undo the variable. The config store reads the process environment once at boot, so a raw `process.env` write would not work; the override/restore pattern is required.
- **`scenarios/index.ts`** — The scenario entry point that wraps the build call in `withoutHumanChallenge` before driving the shop's flows.
- **`tests/unit/scenarios/no-human-challenge.test.ts`** — Unit tests exercising the wrapper's setup, teardown, and error-propagation behavior.

## Notes

- Uses `.finally(restore)`, not a `try/finally` block, so the restore runs on both resolve and reject paths.
- The restore function returned by `overrideEnvironment` correctly handles the case where the variable was previously *unset* (not merely set to a different value).
- The doc-comment notes that a process which boots *with* the provider enabled (the paired antibot suite) is unaffected: the build completes before the process begins listening.
- This file is intentionally a module (no default export); import the named `withoutHumanChallenge` directly.
