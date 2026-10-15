---
source: scripts/contracts/generated-file.ts
sha256: acb2cf6cd35a2bb9f1bd47cc58da6c516e96f67de343f2aecd44f4f2c8e21e01
generated_at: 2026-10-15T09:38:19.436491+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generated-file.ts

## Purpose

Shared write-or-verify utility that every contract generator calls as its final step. It encapsulates the "write the generated file, or under `--check` validate it matches what's on disk" pattern so generators don't each re-implement it. The file is kept byte-identical across both repos in the pair.

## Key elements

- **`writeOrCheck(output, text, label, fixCommand?)`** — The sole export.
  - *Normal mode:* ensures the target directory exists, writes `text` to `output`, and logs a success line.
  - *`--check` mode* (detected via `process.argv.includes('--check')`): compares the file already on disk against `text`. If identical, logs "is current"; otherwise prints a mismatch message including the `fixCommand` and sets `process.exitCode = 1` (no `process.exit`, so buffered stdout flushes).
  - `fixCommand` defaults to `'npm run gen:api'`.

## Relationships

- **scripts/contracts/authorization-bundle.ts**, **generate-asyncapi-types.ts**, **generate-error-codes.ts**, **generate-permission-actions.ts**, **generate-request-content-types.ts** — Each is a contract generator that imports `writeOrCheck` and calls it with its generated text, the source label (e.g. `openapi.yaml`), and optionally a tailored `fixCommand`.
- **scripts/docker/generate-dockerfile-dockerignore.ts** — Also a generator that delegates its file-write/verify step to `writeOrCheck`.

## Notes

- `--check` is a **global CLI flag** (checked once via `process.argv`), not a parameter of `writeOrCheck`. Any runner script must pass `--check` on the command line for verify mode to activate.
- The function uses `process.exitCode` rather than `process.exit(1)` so that `console.error` output is not truncated.
- `mkdirSync` is called with `{ recursive: true }` because some generators (e.g. those writing into `api/`) may run **before** orval has created that directory.
- The file is intentionally duplicated byte-for-byte in the paired repo; do not diverge the two copies.
