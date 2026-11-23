---
source: scripts/contracts/generate-permission-vocabulary.ts
source_sha256: f4b0f952201ae004b1bb4395e2e2f10d3d2d770defbbf5805f207ef6c596d01f
context_sha256: a738189e4f17dbaaa13351b737aa7a75e3bac51660f8f2849bd8fbef518c863a
generated_at: 2026-11-22T01:56:39.197569+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generate-permission-vocabulary.ts

## Purpose
A `tsx` script that generates the permission vocabulary module (actions, subjects, rule ids, set names, scopes, step-up tiers, and the subject-to-actions pair map) from `authorization-keys.generated.yaml`. Each item is emitted as a runtime array plus its union type. The same script and render module exist in both the backend and frontend repos (kept in sync by hand), and each writes a `permission-vocabulary` module beside its other generated contract types.

## Key elements
- `INPUT` — path to the permission-key YAML, taken from the required `--in` argument (resolved against `REPO_ROOT`).
- `OUTPUT` — path of the file to generate, taken from the required `--out` argument (resolved against `REPO_ROOT`).
- `output` — the full generated text, built by `renderPermissionVocabulary(readPermissionVocabulary(<yaml text>))`.
- Final call to `writeOrCheck(OUTPUT, output, INPUT)` — writes the file, or under `--check` compares it with the file on disk.

The file has no exports; it runs on import as a CLI entry point.

Usage: `tsx scripts/contracts/generate-permission-vocabulary.ts --in <yaml> --out <path> [--check]`

## Relationships
- `scripts/cli.ts` — supplies `requiredPath`, which parses the `--in` and `--out` arguments.
- `scripts/modules-on-disk.ts` — supplies `REPO_ROOT`, the base for resolving those paths.
- `scripts/contracts/permission-vocabulary-render.ts` — supplies `readPermissionVocabulary` (parses the YAML text) and `renderPermissionVocabulary` (produces the output text).
- `scripts/contracts/generated-file.ts` — supplies `writeOrCheck`, which handles writing and `--check` behavior.

## Notes
- `--check` writes nothing and exits 1 on a mismatch. This is the contract every generator in this directory follows.
- The input YAML is the same document in both repos. The backend reads its `shared/authorization-keys.generated.yaml`. The frontend reads the copy that `sync:frontend` hands it.
- The render module is duplicated by hand across the two repos and is not automatically synced, so changes must be mirrored manually.
