---
source: scripts/contracts/generate-permission-actions.ts
sha256: 07c845cfaac20697d76c371f33d7cdc22a17941bfdfb3338c78c42636809b945
generated_at: 2026-10-15T09:37:59.365353+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-permission-actions.ts

## Purpose

Code-generation script that reads the `actions:` block from an `authorization-keys.yaml` document and emits a TypeScript module containing a runtime string array plus the corresponding union type. It exists so both repos in the pair (backend and frontend) can share the same permission-action vocabulary without hand-maintaining the list.

## Key elements

- **`ROOT`** — Resolves the repo root via `import.meta.url` (ESM; no `__dirname` available).
- **`INPUT`** / **`OUTPUT`** — Parsed from `--in` and `--out` CLI flags via `requiredPath`.
- **Main pipeline (top-level, no wrapper fn)** — `readFileSync(INPUT)` → `readPermissionActions()` → `renderPermissionActions()` → `writeOrCheck(OUTPUT, …)`. Runs immediately on script execution.
- **`--check` flag** — Supported by `writeOrCheck`; when set, the script compares the rendered output against what is on disk and exits 1 on mismatch without writing.

## Relationships

- **`scripts/cli.ts`** — Imports `requiredPath`, a small helper that reads a required CLI flag and resolves it against `ROOT`.
- **`scripts/contracts/permission-actions-render.ts`** — Imports `readPermissionActions` (parses the YAML `actions:` entries) and `renderPermissionActions` (produces the final TS source string).
- **`scripts/contracts/generated-file.ts`** — Imports `writeOrCheck`, the shared write-or-compare primitive used by every generator in this directory.

## Notes

- **Shared script, two repos.** The file is byte-identical in the backend and frontend repos. Each repo feeds it a different YAML path (`shared/authorization-keys.yaml` vs. `contracts/authorization-keys.yaml`), but the document content is kept in sync.
- **ESM.** The shebang (`#!/usr/bin/env tsx`) and `import.meta.url` usage mean this runs as an ES module; do not convert to CJS patterns.
- **`--check` is the contract for CI.** Any generator in this directory follows the same convention: `--check` writes nothing and exits non-zero on drift, so it can be wired into a pre-commit or CI step without side effects.
