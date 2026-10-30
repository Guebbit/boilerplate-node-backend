---
source: scripts/contracts/generated-file.ts
sha256: 52be0c5e45c0ced5bd3296a1093b429dd8190ef06ec6ee7f2de5072922124b81
generated_at: 2026-10-29T01:31:14.569345+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generated-file.ts

## Purpose

Single shared utility that serves as the common write-or-verify tail for every contract generator. It centralises the final "persist the generated text to disk (or, under `--check`, confirm the on-disk copy matches)" step so each generator script doesn't reimplement it.

## Key elements

- **`writeOrCheck(output, text, label, fixCommand?)`** — Sole export. Two modes:
  - *Write mode* (default): `mkdirSync` the parent directory (recursive), write `text` as UTF-8, log a `✓ Generated …` line.
  - *Check mode* (detected via `--check` flag): compare the existing file's contents to `text`; if identical, log a pass; otherwise print a `console.error` with the suggested `fixCommand` and set `process.exitCode = 1` (no write occurs).
- **`fixCommand`** (optional, defaults to `'npm run gen:api'`) — the regeneration command named in the failure message, letting each generator advertise its own command.

## Relationships

- **`scripts/cli.ts`** — provides the `hasFlag` helper used to detect the `--check` flag.
- **`scripts/contracts/authorization-bundle.ts`, `generate-asyncapi-types.ts`, `generate-error-codes.ts`, `generate-permission-actions.ts`, `generate-request-content-types.ts`, `generate-shared-rule-schemas.ts`** — each of these generator scripts calls `writeOrCheck` as its final step to persist (or verify) the file it has just produced.
- **`scripts/docker/generate-dockerfile-dockerignore.ts`** — likewise uses `writeOrCheck` to write or check the Dockerfile / `.dockerignore` it generates.

## Notes

- The file header declares it a **SHARED SCRIPT** that must remain **byte-identical** across the two repos in the pair. Do not diverge the implementation locally; coordinate changes upstream.
- `process.exitCode` is set rather than calling `process.exit()` so the `console.error` message is guaranteed to flush before the process ends.
- `mkdirSync(…, { recursive: true })` is intentional: some generators run *before* the `api/` directory exists (e.g., before orval creates it), so the parent path may not be present yet.
