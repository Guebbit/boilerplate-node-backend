---
source: scripts/contracts/permission-actions-render.ts
sha256: 400c6abfac627a5a366dbab80ce7d93a9f7e01a30502469fce1413ad781abd8d
generated_at: 2026-10-01T12:27:59.186098+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/permission-actions-render.ts

## Purpose

Pure (filesystem-free) half of the permission-action generator. It validates the `actions:` list out of the shared authorization YAML document and renders the TypeScript source (a const array plus a derived union type) that carries those actions into consuming code. Keeping I/O out of this file lets unit tests exercise the logic without touching disk.

## Key elements

- **`readPermissionActions(yamlText: string): string[]`** — Parses the full YAML document, extracts the `actions:` key, and validates it is a non-empty array of unique strings. Throws a descriptive `Error` on any violation (missing, empty, non-string entries, duplicates).
- **`renderPermissionActions(actions: readonly string[]): string`** — Takes the validated action list and returns the complete text of the generated `.ts` file: a `PERMISSION_ACTIONS` const array and a `PermissionAction` union type derived from it, with standard "DO NOT EDIT" headers.

## Relationships

- **`scripts/contracts/generate-permission-actions.ts`** — The orchestration counterpart. It performs the filesystem read of `authorization-keys.yaml` and pipes the raw text through `readPermissionActions`, then writes the result of `renderPermissionActions` to the output path. This file is intentionally I/O-free so the other file remains the only one that touches disk.
- **`tests/unit/scripts/contracts/permission-actions-render.test.ts`** — Unit tests that call both exported functions directly with in-memory strings, covering happy paths and each validation error branch.

## Notes

- This file is a **shared script**: it is expected to be byte-identical in both repos of the paired-repo setup (same convention as `generate-error-codes.ts`). Do not let the two copies drift.
- The generated output uses `as const` on the array so the union type is a literal union, not `string`.
- Order of actions in the generated file matches their declared order in the YAML document; no sorting is applied.
