---
source: tests/unit/scripts/scaffold/options.test.ts
sha256: ceed672719db58a90df6801f710a84d4c6847516be61f473e9f0a49539b85426
generated_at: 2026-10-15T13:31:34.449294+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/options.test.ts

## Purpose

Unit tests for the scaffold CLI argument parser. They pin down the defaults, the full set of flags (including negation flags), and every refusal path so the actual CLI shell entry-point need not be tested separately.

## Key elements

- **`describe('parseArguments')`** — the sole test block; three cases:
  - *Defaults*: a bare `[name]` arg yields `group: 'foundation'`, `audit: true`, `regenerate: true`, and a TODO summary.
  - *Full flag read*: `--group`, `--entity`, `--summary`, `--no-audit`, `--no-regenerate` are parsed without a value being mistaken for the positional `name`.
  - *Refusals* (`it.each`): parameterized table covering missing name, extra positional arg, invalid name charset, non-PascalCase `--entity`, and out-of-domain `--group`. Each asserts `isRefusal(result) === true` and a regex on `result.error`.

- **`isRefusal`** — imported type guard used both as a boolean assertion and to narrow the result type before accessing `.error`.

## Relationships

- **`scripts/scaffold/options.ts`** — the module under test. This file imports `parseArguments` (the function under test) and `isRefusal` (the discriminator for the error variant of its return type). No other dependencies.

## Notes

- The module doc comment explicitly states the intent: keep the CLI shell untested by exhaustively covering the parser here.
- `isRefusal` is used in a `result && result.error` pattern after the `expect(...).toBe(true)` assertion — the guard narrows the discriminated union so TypeScript allows property access in the same expression.
- The refusal table uses `it.each` with a `%j` placeholder, so the generated test name serializes the argv array as JSON.
