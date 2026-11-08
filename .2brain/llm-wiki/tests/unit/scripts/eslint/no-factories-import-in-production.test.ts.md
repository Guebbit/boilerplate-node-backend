---
source: tests/unit/scripts/eslint/no-factories-import-in-production.test.ts
sha256: 169b2aa47a337d79b27033a9276df6b1693af1b3cbc436fc0a79917b04317ff3
generated_at: 2026-11-08T10:36:58.955099+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-factories-import-in-production.test.ts

## Purpose

Verifies that the `no-restricted-imports` rule in `eslint.config.ts` correctly rejects any `factories.ts` import from production code (including a module's own `factories.ts`). It does so by writing a temporary probe file into `src/modules/users/`, invoking the **real** `eslint` CLI binary against it, and asserting the rule ID appears in the JSON output.

## Key elements

- **`ESLINT_BIN`** — Resolved path to `node_modules/.bin/eslint` relative to repo root.
- **`PROBE_PATH` / `PROBE_RELATIVE`** — Absolute and repo-relative paths of the temporary file written to `src/modules/users/__factories-import-probe.ts`.
- **`lintProbe()`** — Runs `eslint --format json --no-warn-ignored <probe>` via `execFile`, parses stdout into a `ruleId` list. Treats a non-zero exit (i.e. a finding) as success; only a JSON parse failure rejects the promise.
- **Test case** — Writes a one-line import of `./factories`, calls `lintProbe()`, asserts that `no-restricted-imports` is present in the messages.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to anchor all filesystem paths (binary, probe, cwd) to the repository root regardless of where jest resolves modules.

## Notes

- Shells out to the `eslint` binary instead of using the `ESLint` Node API because the flat config (`eslint.config.ts`) requires `jiti`, which does not resolve inside a jest worker.
- The probe file is placed under `src/modules/users/` specifically so that `parserOptions.project` (TypeScript project reference) resolves against a real physical TS program.
- Cleanup uses `rmSync(PROBE_PATH, { force: true })` in `afterEach`; if a test crashes mid-write the flag prevents a throw.
- The `execFile` callback intentionally ignores `_error` (non-zero exit is the *expected* signal that ESLint found a violation) and only rejects on a `JSON.parse` failure of stdout.
