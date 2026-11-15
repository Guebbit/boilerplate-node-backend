---
source: tests/unit/scripts/eslint/no-side-effects-outside-services.test.ts
sha256: 94090a150d15f57814f677dc7e2fc66b61e2c908959e3652028b9755173797cf
generated_at: 2026-11-15T00:26:30.299570+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-side-effects-outside-services.test.ts

## Purpose

Verifies that the `no-restricted-imports` block in `eslint.config.ts` correctly blocks four side-effect functions (`enqueueEmail`, `recordAudit`, `emitAnalyticsEvent`, `emitDomainEvent`) when imported from a controller-layer file, while allowing them in a service-layer file. It does so by writing temporary probe files into the real `src/modules/users/` tree and running the actual `eslint` binary against them — mirroring the approach used by `no-factories-import-in-production.test.ts`.

## Key elements

- **`lintFile(relativePath, source)`** — writes `source` to `relativePath` under `REPO_ROOT`, invokes the real ESLint binary with `--format json --no-warn-ignored`, and resolves the parsed `messages` array. A non-zero exit code (i.e. lint findings) is treated as success; only a JSON parse failure rejects.
- **`PROBE_SOURCE`** — a static string that imports the four side-effect functions and voids them so no unused-import warnings interfere.
- **`CONTROLLER_PROBE` / `SERVICE_PROBE`** — the two relative paths (`src/modules/users/controllers/…` vs. `src/modules/users/…`) that represent "outside" and "inside" the service layer.
- **`afterEach`** — `rmSync`s both probe files (with `force: true`) to keep the working tree clean.
- **Two `it` blocks** — one asserts exactly four `no-restricted-imports` messages on the controller probe; the other asserts zero such messages on the service probe.

## Relationships

- **`tests/support/paths.ts`** — provides `REPO_ROOT` (imported as `@tests/paths`), which anchors the ESLint binary path, the probe file write/delete paths, and the `cwd` passed to `execFile`.

## Notes

- Despite living under `tests/unit/`, this is effectively an integration test: it shells out to the real ESLint CLI and depends on `parserOptions.project` resolving against the live TypeScript program.
- ESLint's non-zero exit code is the *expected* outcome when it reports findings; the callback only rejects on a failed `JSON.parse` of its output.
- `maxBuffer` is set to 10 MB to accommodate ESLint's JSON output on larger projects.
- Probe files are placed under `src/modules/users/` specifically so that `parserOptions.project` picks them up in the TypeScript program; a path outside the project root would not exercise the rule.
