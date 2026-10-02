---
source: scripts/testing/measure-scaffold.ts
sha256: 7bd7bfbb7756bdff6be704f121be2ead37224838eb99ba63576e091e2fa3a5aa
generated_at: 2026-10-01T12:41:11.828173+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-scaffold.ts

## Purpose

Integration-style verification that a freshly scaffolded module passes every quality gate the repo enforces (type-check, lint, format, unit tests, cross-cutting rules, docs build). It runs against a full copy of the checkout in a temp directory so the generated code is exercised in context. Report-only — intentionally excluded from the commit gate because it takes minutes. Run after touching `scripts/scaffold/` or any shared file the scaffolder emits.

## Key elements

- **`PROBE` / `QUIET`** — Two scaffolded module names (`measure-probes`, `quiet-things`). `QUIET` uses `--no-audit`, `--group shop`, and `--entity` flags to exercise alternate code-gen templates.
- **`FOLDERS`** — Resolved `src/modules/<name>` paths reused across lint, prettier, and jest checks.
- **`CHECKS`** — Ordered array of `{ label, command, args, expectFailure? }` entries defining the full run sequence: two scaffold invocations, `ts-check`, ESLint, Prettier, Jest on the generated modules, `check:docs-graph`, `test:cross-cutting`, `docs:build`, and a final idempotent-refusal check (expects a non-zero exit).
- **`run(check)`** — Executes one `Check` via `runIn` and compares the exit code against `expectFailure`.
- **`assembleScratchCopy(REPO_ROOT, SCRATCH)`** (imported) — Copies the repo into the scratch dir before any check runs.
- **Top-level flow** — Copies, maps `CHECKS` through `run`, prints a PASS/FAIL summary, sets `process.exitCode`.

## Relationships

- **`scripts/testing/scratch-copy.ts`** — Provides `assembleScratchCopy` (full-tree copy to the scratch path) and `runIn` (spawn a command with the scratch dir as cwd). This file is its only consumer in the testing scripts.

## Notes

- `SCRATCH` lives under `os.tmpdir()` specifically because `fs.cpSync` rejects a destination nested inside its own source tree.
- The last check (`a second scaffold is refused`) expects a **non-zero** exit; the `expectFailure` flag inverts the pass/fail comparison in `run`.
- The script is invoked as `npm run measure:scaffold` (shebang is `tsx`); it is not part of CI merge gating.
- `REPO_ROOT` is computed as two levels up from `scripts/testing/` via `__dirname`.
