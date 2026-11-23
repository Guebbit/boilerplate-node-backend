---
source: scripts/contracts/generated-file.ts
source_sha256: 0cbe46a0bb13875dae7955225df363add9f4a13aae2a741a534e0488630a24e2
context_sha256: 55790083d9efd56e43a5fbaa07a77c9506836fbfbe8405affafff02db18df9b7
generated_at: 2026-11-22T01:57:45.983875+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generated-file.ts

## Purpose
Provides `writeOrCheck`, the shared "write-or-verify" step that every contract generator ends with. In normal mode it writes the generated file; under `--check` it compares the expected text against what is on disk and fails if they differ, so CI can detect stale generated output. The file is marked as a shared script, byte-identical in both repos of the pair.

## Key elements
- `writeOrCheck(output, text, label, fixCommand = 'npm run gen:api')`: returns `void`.
  - **Write mode** (no `--check` flag): creates the parent directory recursively, writes `text` as UTF-8, and logs `✓ Generated <output>`.
  - **Check mode** (`--check`): writes nothing. If the file exists and matches `text` exactly, it logs `✓ <output> is current with <label>`. Otherwise it logs an error naming the `label` and the `fixCommand`, tells the user to commit the result, and sets `process.exitCode = 1`.
  - Parameters: `output` is the absolute path, `text` the full expected content, `label` the source the file is generated from (e.g. `openapi.yaml`), and `fixCommand` the regenerate command shown on failure.

## Relationships
- Imports `hasFlag` from `scripts/cli.ts` to detect `--check`.
- The generator scripts in `scripts/contracts/` are its neighbors and call it to finish their run: `generate-asyncapi-types.ts`, `generate-error-codes.ts`, `generate-permission-vocabulary.ts`, `generate-redirect-query.ts`, `generate-request-content-types.ts`, `generate-shared-rule-schemas.ts`, `generate-upload-types.ts`. `authorization-bundle.ts` is also a neighbor in the graph.

## Notes
- Failure is signalled through `process.exitCode` rather than `process.exit()`, so the error message is flushed before the process ends.
- The `mkdirSync` call is needed because `regenerate` writes some of these files before orval creates `api.generated/`.
- A missing file in check mode counts as a mismatch.
- The default `fixCommand` is `npm run gen:api`. Callers can override it.
