---
source: tests/unit/scripts/eslint/no-factories-import-in-production.test.ts
sha256: 169b2aa47a337d79b27033a9276df6b1693af1b3cbc436fc0a79917b04317ff3
generated_at: 2026-10-15T13:27:41.167765+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-factories-import-in-production.test.ts

## Purpose

Verifies that the `no-restricted-imports` rule in `eslint.config.ts` correctly rejects imports of `factories.ts` from production code. Rather than invoking the ESLint Node API, it shells out to the real `eslint` CLI against a temporarily-written probe file, because the Node API's config loader requires `jiti` to parse `eslint.config.ts`, which does not resolve inside a Jest worker.

## Key elements

- **`lintProbe()`** — Runs `eslint --format json --no-warn-ignored <probe>` via `execFile`, parses the JSON output, and resolves with the array of `{ ruleId }` messages for the first file. A non-zero exit (i.e. lint findings) is treated as success; only a failure to parse ESLint's JSON is rejected.
- **`PROBE_PATH` / `PROBE_RELATIVE`** — Constants pointing to `src/modules/users/__factories-import-probe.ts`, the temporary file written by the test.
- **`ESLINT_BIN`** — Resolved path to `node_modules/.bin/eslint` relative to `REPO_ROOT`.
- **`describe` / single `it` block** — Writes a one-line file that imports `./factories`, calls `lintProbe()`, and asserts that at least one message carries `ruleId === 'no-restricted-imports'`. `afterEach` removes the probe file.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to anchor all file-system paths (eslint binary, probe file) relative to the repository root.

## Notes

- The probe is placed under `src/modules/users/` deliberately: `parserOptions.project` in the ESLint flat config resolves against the physical TypeScript program, so the file must sit inside a real project directory.
- `execFile` callback ignores the `error` argument (non-zero exit is expected when findings exist) and only rejects if `JSON.parse(stdout)` throws.
- The probe file is created with `writeFileSync` and removed with `rmSync(PROBE_PATH, { force: true })`; there is no `beforeAll`/`afterAll` pairing—cleanup is per-test via `afterEach`.
