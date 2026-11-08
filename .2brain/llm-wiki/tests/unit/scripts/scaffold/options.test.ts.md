---
source: tests/unit/scripts/scaffold/options.test.ts
sha256: ceed672719db58a90df6801f710a84d4c6847516be61f473e9f0a49539b85426
generated_at: 2026-11-08T10:42:03.421641+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/options.test.ts

## Purpose

Unit tests for the CLI argument-parsing layer (`parseArguments`, `isRefusal`) of the scaffold script. It locks down the default module shape, full flag parsing (including value-bearing flags and negations), and every rejection path, so the higher-level CLI shell can be exercised without re-testing parsing.

## Key elements

- **`describe('parseArguments')`** — the single test suite in the file.
  - *defaults test* — asserts that a bare module name resolves to `group: 'foundation'`, a TODO summary, and both `audit`/`regenerate` set to `true`.
  - *full-flag test* — passes `--group`, `--entity`, `--summary`, `--no-audit`, `--no-regenerate` alongside the name and asserts the parsed object matches, verifying value tokens aren't misread as the name.
  - *refusal table (`it.each`)* — five cases covering: missing name, unexpected extra argument, invalid module name characters, non-PascalCase `--entity`, and out-of-domain `--group`. Each asserts `isRefusal` is true and the `.error` message matches a regex.

## Relationships

- **`scripts/scaffold/options.ts`** — the module under test. This file imports `parseArguments` and `isRefusal` directly and exercises both their success and failure contracts.

## Notes

- The test file deliberately imports only the two pure functions; it does **not** import or invoke any command-dispatch or I/O code, keeping the CLI shell out of scope.
- Refusal assertions use `isRefusal(result)` as a type-guard before accessing `result.error`, so a future change that returns a plain string instead of a tagged object will surface here as a type error, not just a runtime failure.
- The `it.each` table is the canonical list of rejection rules. Adding a new guard in `options.ts` without a corresponding row here is the most likely way to regress silently.
