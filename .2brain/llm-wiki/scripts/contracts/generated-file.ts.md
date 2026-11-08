---
source: scripts/contracts/generated-file.ts
sha256: 52be0c5e45c0ced5bd3296a1093b429dd8190ef06ec6ee7f2de5072922124b81
generated_at: 2026-11-08T02:42:38.544846+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generated-file.ts

## Purpose

Shared write-or-verify tail that every contract generator ends with. It centralizes the final step of writing a generated file to disk (or, under `--check`, comparing expected output against what is already on disk) so generators don't each reimplement the I/O and error-reporting logic.

## Key elements

- **`writeOrCheck(output, text, label, fixCommand?)`** — The sole export. In normal mode it `mkdirSync`-es the parent directory (idempotent, recursive) and `writeFileSync`-es the content, logging a success line. Under `--check` it reads the existing file, compares byte-for-byte against `text`, and either confirms it is current or prints a mismatch message naming `label` and the `fixCommand` to run, then sets `process.exitCode = 1` (deliberately *not* `process.exit` so stderr flushes). `fixCommand` defaults to `'npm run gen:api'`.

## Relationships

- **`scripts/cli.ts`** — Imports `hasFlag` from it to detect the `--check` flag.
- **`scripts/contracts/generate-*.ts`** (authorization-bundle, asyncapi-types, error-codes, permission-vocabulary, redirect-query, request-content-types, shared-rule-schemas, upload-types) — Each generator calls `writeOrCheck` as its final step to persist its output.
- **`scripts/docker/generate-dockerfile-dockerignore.ts`** — Same pattern: calls `writeOrCheck` to write/verify the generated Dockerfile / .dockerignore.

## Notes

- The header comment marks this file as **byte-identical across both repos** in the paired-repo setup; do not let it diverge.
- `mkdirSync` is called with `{ recursive: true }` because some generators run *before* the `api/` directory exists (e.g., before orval has created it).
- The function uses `process.exitCode` rather than `process.exit` specifically so that `console.error` output is flushed before the process terminates.
- `label` is free-text context for error messages (e.g. `"openapi.yaml"`); it has no filesystem meaning.
