---
source: scripts/contracts/generate-permission-vocabulary.ts
sha256: 21bd502fb6a2e6d955a7d026d9e601c0ec750723eba23c47c70805b5536af047
generated_at: 2026-11-08T02:41:40.943602+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-permission-vocabulary.ts

## Purpose

Generates a TypeScript `permission-vocabulary` module (runtime arrays + union types for actions, subjects, rule ids, set names, scopes, step-up tiers, and the subject-to-actions pair map) from an `authorization-keys.yaml` document. It exists so both the backend and frontend repos share identical, type-safe permission identifiers derived from a single source-of-truth YAML file.

## Key elements

- **Main pipeline** (top-level, no exported functions): reads the YAML at `--in`, calls `readPermissionVocabulary` → `renderPermissionVocabulary`, then calls `writeOrCheck` with the result.
- **CLI flags**: `--in <yaml>` (input YAML path), `--out <path>` (output TS file path), `--check` (dry-run; exit 1 on mismatch instead of writing).
- **`ROOT`**: resolved via `import.meta.url` (ESM), not `__dirname`.
- **Shebang**: `#!/usr/bin/env tsx` — run directly with `tsx`.

## Relationships

- **`scripts/cli.ts`** — imports `requiredPath` for validating and resolving `--in` / `--out` arguments relative to `ROOT`.
- **`scripts/contracts/generated-file.ts`** — imports `writeOrCheck`, which either writes the rendered text to disk or (under `--check`) diffs it against the existing file and sets the exit code.
- **`scripts/contracts/permission-vocabulary-render.ts`** — imports `readPermissionVocabulary` (parses the YAML into a structured vocabulary object) and `renderPermissionVocabulary` (serialises that object into the generated TS source text).

## Notes

- The render module (`permission-vocabulary-render.ts`) is **hand-copied** into a second repo; it is not synced by any tool. Both repos must keep it in lockstep manually.
- The input YAML is the same document in both repos but lives at different paths: backend `shared/authorization-keys.yaml`, frontend `contracts/authorization-keys.yaml` (delivered by a `sync:frontend` step).
- `--check` is the contract every generator in this directory follows: write nothing, exit non-zero on drift.
- Because this is ESM, `import.meta.url` is used for path resolution; `__dirname` is unavailable.
