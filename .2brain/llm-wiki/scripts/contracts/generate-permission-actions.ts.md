---
source: scripts/contracts/generate-permission-actions.ts
sha256: 714d945a01b7bcec6bc423a4327c31532b2814cb5ee2a53647193692e9894a19
generated_at: 2026-10-01T12:27:08.662143+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-permission-actions.ts

## Purpose

CLI script that turns the `actions:` block of an `authorization-keys.yaml` document into a TypeScript module (a runtime string array plus a derived union type). It exists so both repos in the paired frontend/backend setup can generate an identical `permission-actions` module from the same logical YAML source.

## Key elements

- **`requiredPath(flag)`** — reads a required `--flag <value>` pair from `process.argv`, resolves it against the repo root, and exits 1 with an error if missing.
- **`ROOT`** — repo root, derived via `import.meta.url` (the script runs as ESM under `tsx`).
- **`INPUT` / `OUTPUT`** — absolute paths supplied by `--in` and `--out`.
- **`checkOnly`** — boolean set when `--check` is present; suppresses the write and instead exits 1 on a content mismatch.
- **Main flow** — `readFileSync(INPUT)` → `readPermissionActions` → `renderPermissionActions` → either `writeFileSync` (default) or a byte-equality comparison (`--check`).

## Relationships

- **`scripts/contracts/permission-actions-render.ts`** — provides the two functions this script delegates to: `readPermissionActions` (parses the YAML text into an actions list) and `renderPermissionActions` (serializes that list into the final TypeScript module source). This file is purely a CLI wrapper around that render module.

## Notes

- **Paired-repo convention:** the script is byte-identical in both repos; the only difference is the `--in` path (`shared/authorization-keys.yaml` vs `contracts/authorization-keys.yaml`).
- **ESM:** uses `import.meta.url` rather than `__dirname`; must be invoked via `tsx`.
- **Directory creation:** `mkdirSync(..., { recursive: true })` runs before writing because the target `api/` directory may not exist yet (the `regenerate` step runs this generator *before* orval scaffolds the folder).
- **`--check` contract:** shared by all generators in this directory — writes nothing, prints a "run `npm run gen:api`" hint, and exits 1 on mismatch.
