---
source: tests/unit/scripts/eslint/self-barrel-import.test.ts
sha256: bbfac8efd9bd0c35da4b3d616100686879af64cdbd1d5c637fb1ede792dd3cab
generated_at: 2026-09-23T20:31:09.142413+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/self-barrel-import.test.ts

## Purpose

Liveness probe for the `boundaries/dependencies` ESLint policy: verifies that a same-module self-barrel import is actually *evaluated* (and refused) rather than silently skipped. Guards against a regression where `checkInternals` is unset, making the policy a no-op that looks identical to a passing lint run.

## Key elements

- **`lintProbe()`** — Spawns the real `eslint` binary (`node_modules/.bin/eslint`) with `--format json --no-warn-ignored` against the probe file; resolves the first file's `messages` array. Treats a non-zero exit as expected (a finding is the success case); only a JSON parse failure rejects.
- **`describe('a module cannot import its own barrel')`** — Single test that writes a one-line probe file importing from `@modules/products`, runs `lintProbe()`, and asserts at least one message has `ruleId: 'boundaries/dependencies'`.
- **`afterEach` cleanup** — `rmSync(PROBE_PATH, { force: true })` ensures the temp probe is removed even on failure.
- **Constants** — `REPO_ROOT`, `ESLINT_BIN`, `PROBE_PATH` (`src/modules/products/__self-barrel-probe.ts`), `PROBE_RELATIVE` — fixed paths; no env-var or config lookup.

## Relationships

- Reads **`eslint.config.ts`** implicitly via the spawned ESLint process (the flat config under test).
- Writes a temporary file under **`src/modules/products/`** for the duration of one lint invocation; the directory must exist and contain a resolvable barrel (`index` re-export) for the rule to have a same-module edge to evaluate.
- Uses the same subprocess pattern as `apply.test.ts` (noted in the header comment): the Node ESLint API's `jiti`-based config loader cannot run inside a Jest worker's module resolver.

## Notes

- A *finding* exits ESLint non-zero; the `execFile` callback deliberately ignores the error object and parses `stdout`. Only a failure to `JSON.parse` the output is treated as a test error.
- The probe file must live at a **physical** path under `src/` — a virtual or temp-dir path would cause `parserOptions.project` to fail TypeScript program resolution *before* the boundaries rule ever runs, producing a parse error instead of a rule violation.
- `--no-warn-ignored` suppresses the "file ignored" warning that would otherwise mask the probe if the products module were listed in an `ignores` glob.
