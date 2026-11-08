---
source: tests/unit/scripts/cli.test.ts
sha256: 9eb09702bb8661250a665279a2dfd610e2e86d812dd10c8811e094086e2c59d9
generated_at: 2026-11-08T10:31:49.166545+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/cli.test.ts

## Purpose

Unit tests for the `hasFlag` and `flagValue` helpers in `scripts/cli.ts`, verifying that the lenient CLI argument parser correctly detects boolean switches and reads valued flags from a simulated `process.argv` without throwing on unknown arguments.

## Key elements

- **`startedWith(...rest)`** – Test helper that sets `process.argv` to `['node', 'script.ts', ...rest]`, simulating a script invocation with the given arguments.
- **`afterEach` block** – Restores `process.argv` to its original value so no other test in the suite sees a mutated global.
- **`describe('hasFlag')`** – Four cases covering: flag present, flag absent, flag found among positionals/unknown flags, and a valued flag (`--only=shard-03`) not being mistaken for an unrelated boolean (`--force`).
- **`describe('flagValue')`** – Two cases covering: both `--flag value` (space-separated) and `--flag=value` (equals) syntaxes, and `undefined` return when the flag is absent.

## Relationships

- **`scripts/cli.ts`** – The module under test. This file imports `flagValue` and `hasFlag` from it and exercises them exclusively through a mocked `process.argv`.

## Notes

- The tests intentionally include "unknown" flags (e.g. `--unknown=1`) and positional arguments (`report.json`) in the simulated argv. This reflects the design contract documented in `cli.ts`: unknown tokens are silently ignored, never throw.
- Because the tests mutate the global `process.argv` directly, the `afterEach` restoration is load-bearing—removing it would leak fake arguments into any subsequent test running in the same process.
- `flagValue` tests confirm it returns a **string** (`'2'`, `'3'`), not a number, even for numeric-looking values.
