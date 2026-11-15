---
source: scripts/contracts/generate-permission-vocabulary.ts
sha256: 0b404c0a06a461a6e86ae62cece71882921daefeb8a324bcfa68ac40994f80d4
generated_at: 2026-11-14T17:24:56.180097+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-permission-vocabulary.ts

## Purpose

CLI script that generates a TypeScript `permission-vocabulary` module (runtime arrays + union types for actions, subjects, rule ids, set names, scopes, step-up tiers, and the subject-to-actions pair map) from an `authorization-keys.generated.yaml` file. It exists so both the backend and frontend repos can derive identical vocabulary types from the same YAML document.

## Key elements

- **`INPUT`** – Resolved from the `--in` CLI flag (relative to `REPO_ROOT`); the path to the source YAML.
- **`OUTPUT`** – Resolved from the `--out` CLI flag; the path of the generated `.ts` file.
- **`output`** – The full generated file text, produced by piping `readFileSync(INPUT)` → `readPermissionVocabulary` → `renderPermissionVocabulary`.
- **Final `writeOrCheck` call** – Writes `output` to `OUTPUT`, or (under `--check`) compares and exits 1 on mismatch without writing.
- **CLI contract** – Usage: `tsx scripts/contracts/generate-permission-vocabulary.ts --in <yaml> --out <path> [--check]`.

## Relationships

- **`scripts/cli.ts`** – Imports `requiredPath` to parse the `--in` / `--out` arguments and fail fast if either is missing.
- **`scripts/contracts/generated-file.ts`** – Imports `writeOrCheck`, which handles the atomic write-or-diff logic and the `--check` exit-code contract shared by all generators in this directory.
- **`scripts/contracts/permission-vocabulary-render.ts`** – Provides `readPermissionVocabulary` (parses the YAML string into a vocabulary object) and `renderPermissionVocabulary` (serializes that object into the final TypeScript source text).
- **`scripts/modules-on-disk.ts`** – Exports `REPO_ROOT`, used as the base directory when resolving the `--in` and `--out` paths.

## Notes

- The render module (`permission-vocabulary-render.ts`) is **duplicated by hand** in the backend and frontend repos; it is not auto-synced. Both sides write a `permission-vocabulary` module alongside their other generated contract types.
- The input YAML is the *same logical document* in both repos but lives at different paths: backend reads `shared/authorization-keys.generated.yaml`; the frontend reads `contracts/authorization-keys.yaml` (copied over by a `sync:frontend` step).
- This file is a top-level script (no exports); it is invoked directly via `tsx` and is expected to be idempotent under `--check`.
