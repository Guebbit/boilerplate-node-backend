---
source: tests/unit/scripts/eslint/no-factories-import-in-production.test.ts
sha256: d5419afbf094794382a48eedcbf5b7967954eb525b145574c85775088c8f2aaf
generated_at: 2026-09-27T16:13:18.169624+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-factories-import-in-production.test.ts

## Purpose

Verifies that the `no-restricted-imports` rule in `eslint.config.ts` correctly rejects imports of a module's `factories.ts` builder from production code. It does so by writing a temporary probe file into `src/modules/products/`, shelling out to the real ESLint binary, and asserting the rule fires.

## Key elements

- **`lintProbe()`** — Runs the ESLint CLI (`--format json --no-warn-ignored <probe>`) via `execFile`, parses the JSON stdout, and returns the `messages` array. Treats a non-zero exit as a normal finding (the case under test); only rejects on JSON parse failure.
- **`PROBE_PATH` / `PROBE_RELATIVE`** — Constants pointing to a temporary `__factories-import-probe.ts` file created under `src/modules/products/`.
- **`describe` / `it` block** — Writes a one-line probe (`import { makeProduct } from './factories'`), calls `lintProbe()`, and asserts a `no-restricted-imports` message is present. Cleans the probe in `afterEach` with `rmSync`.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to construct absolute paths for the ESLint binary and the probe file, and to set `cwd` for the CLI invocation.

## Notes

- Shells out to the `eslint` binary rather than using the Node API (`ESLint#lintFiles`) because the flat-config loader depends on `jiti`, which does not resolve inside a Jest worker.
- The probe file is placed under `src/modules/products/` (a real module) because `parserOptions.project` resolves against the physical TypeScript program; a file outside the project would not be linted correctly.
- ESLint exits with code 1 when it reports a finding. The test's `execFile` callback intentionally ignores the error and parses stdout, treating the non-zero exit as expected.
