---
source: tests/unit/scripts/eslint/no-factories-import-in-production.test.ts
sha256: 675d64ed1c44e86a0b18d85d8ac6e782cd9e40e8fb2add36037a44c4b3c52b5e
generated_at: 2026-09-23T20:30:41.103509+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-factories-import-in-production.test.ts

## Purpose

Verifies that the `no-restricted-imports` block in `eslint.config.ts` correctly rejects any `import` of a module's own `factories.ts` from production code. It does so by writing a temporary probe file into the real `src/modules/products/` tree, running the actual `eslint` CLI against it, and asserting a `no-restricted-imports` diagnostic is produced.

## Key elements

- **`lintProbe()`** — Shells out to the repo's `node_modules/.bin/eslint` with `--format json --no-warn-ignored`, parses the JSON output, and resolves with the `messages` array (`{ ruleId, … }[]`). A non-zero exit (i.e. a lint finding) is treated as success; only a JSON parse failure rejects.
- **Path constants** (`REPO_ROOT`, `ESLINT_BIN`, `PROBE_PATH`, `PROBE_RELATIVE`) — Resolve the ESLint binary and the temporary probe file location relative to the test file's own directory.
- **`describe` / `it` block** — Writes a one-line probe (`import { makeProduct } from './factories'`) to `src/modules/products/__factories-import-probe.ts`, calls `lintProbe()`, and asserts at least one message carries `ruleId === 'no-restricted-imports'`.
- **`afterEach`** — Removes the probe file via `rmSync(…, { force: true })` so it never lingers in the working tree.

## Relationships

No graph neighbors are registered for this file. It logically validates the rule configuration in `eslint.config.ts` (the same config file that `self-barrel-import.test.ts` exercises), but no import-level dependency exists between the two test files.

## Notes

- The test intentionally invokes the `eslint` **binary** instead of the Node API (`ESLint#lintFiles`) because the Node API's config loader relies on `jiti` to parse `eslint.config.ts`, and `jiti` does not resolve correctly inside a Jest worker.
- The probe file is placed under `src/modules/products/` (a real directory) because `parserOptions.project` in the ESLint config expects the target to be part of the physical TypeScript program; a temp path outside the project would not be linted.
- ESLint exits with a non-zero code when it reports a finding, which is the expected outcome here. The `execFile` callback therefore ignores the `_error` argument and only rejects if `JSON.parse` of `stdout` fails.
- The probe file is created and destroyed synchronously within the test lifecycle; it is never committed.
