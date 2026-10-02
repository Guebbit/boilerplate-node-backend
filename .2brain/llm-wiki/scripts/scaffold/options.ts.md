---
source: scripts/scaffold/options.ts
sha256: 66507d4160bec0da5f190ea2a5c469cb0734c55ea36731b87355848daee1437f
generated_at: 2026-10-01T12:39:17.642473+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/options.ts

## Purpose

Pure CLI argument parser for the `scaffold:module` command. It converts a raw `argv` array into a typed `ScaffoldOptions` object (or a `ParseRefusal` explaining why the arguments are invalid), keeping the shell/IO layer thin and the parsing logic independently testable.

## Key elements

- **`ScaffoldOptions`** — the typed result: `name`, optional `entity`, `group` (`'foundation' | 'shop'`), `summary`, `audit`, `regenerate`.
- **`USAGE`** — constant help-text string, returned on refusal so the caller can print it.
- **`ParseRefusal`** — `{ error: string }`, the failure branch of the parse result.
- **`parseArguments(argv)`** — the main entry point. Extracts the single positional `name`, validates it with `isValidModuleName`, reads `--entity` / `--group` / `--summary` flags, and interprets `--no-audit` / `--no-regenerate` as boolean negations. Returns `ScaffoldOptions | ParseRefusal`.
- **`isRefusal(result)`** — type guard narrowing on the presence of the `error` key.
- **`valueAfter`** (private) — helper that grabs the token following a flag, returning `undefined` if the flag is last or immediately followed by another `--` flag.

## Relationships

- **`scripts/scaffold/names.ts`** — imported for `isValidModuleName` and `isValidEntityName`; both are used inside `parseArguments` to reject malformed `name` and `--entity` values.
- **`scripts/scaffold/scaffold-module.ts`** — the CLI entry point that calls `parseArguments` and `isRefusal`, then hands the resulting `ScaffoldOptions` to `plan.ts` / `apply.ts`.
- **`scripts/scaffold/plan.ts`** and **`scripts/scaffold/apply.ts`** — downstream consumers of `ScaffoldOptions`; they read the fields (`name`, `entity`, `group`, `audit`, `regenerate`, `summary`) to decide what to generate and whether to run the post-write regeneration step.
- **`tests/unit/scripts/scaffold/options.test.ts`** — unit-tests `parseArguments` and `isRefusal` directly.
- **`tests/unit/scripts/scaffold/plan.test.ts`** / **`apply.test.ts`** — exercise the options these modules receive.
- **`tests/cross-cutting/process-snapshot.test.ts`** — end-to-end snapshot of the scaffold process, exercising the full parse → plan → apply chain.

## Notes

- The parser treats `--entity`, `--group`, and `--summary` as the only flags that *consume* the next token; any other `--` token is considered a standalone flag (e.g. `--no-audit`). This is encoded in the positional-filter logic and in `valueAfter`.
- `summary` defaults to a `TODO` string rather than being required, so a minimal invocation (`scaffold:module -- my-module`) always succeeds.
- `entity` is optional; when absent the downstream code derives it from `name` (naive singular). The parser itself does **not** perform that derivation.
- The `audit` and `regenerate` flags are negation-style (`--no-audit`, `--no-regenerate`) and default to `true` when the flag is absent.
- Validation of `name` explicitly rejects digits (permission keys are letters-and-dots only), which is a project-wide convention beyond simple kebab-case.
