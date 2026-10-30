---
source: tests/cross-cutting/permission-actions.test.ts
sha256: 4e59cd56abe30bf5fbe163449a58ba0f73eff84e05662a730d33dbe5c2c782b8
generated_at: 2026-10-29T06:48:08.155638+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-actions.test.ts

## Purpose

Cross-cutting consistency test that pins the permission-action vocabulary to its single source of truth (`shared/authorization-keys.yaml`). It verifies both ends of the generation chain: the generated `PERMISSION_ACTIONS` array is an exact match for the YAML, and every action referenced by a declared permission rule exists in that array.

## Key elements

- **`yamlActions`** — parsed at test time from `shared/authorization-keys.yaml` via `yaml` + `readFileSync`; the ground-truth list of allowed actions.
- **Test: "are exactly what the shared yaml declares"** — asserts `PERMISSION_ACTIONS` (from `@api/permission-actions`) equals `yamlActions` in both content *and* order (`toEqual`).
- **Test: "cover every action a declared rule carries"** — iterates `PERMISSION_RULES` (from `@kernel/permissions`) and asserts each rule's `action` is a member of `yamlActions`.

## Relationships

- **`src/kernel/permissions.ts`** — source of `PERMISSION_RULES`; the test validates that no rule references an action outside the YAML vocabulary.
- **`tests/support/paths.ts`** — provides `REPO_ROOT` so the test can locate `shared/authorization-keys.yaml` regardless of the working directory the runner invokes.

## Notes

- The YAML is read from disk at test runtime (not imported at build time), so a missing or moved file surfaces as a `readFileSync` error rather than a TypeScript import error.
- The first assertion uses `toEqual` (order-sensitive). Reordering actions in the YAML without regenerating `api/permission-actions.ts` will fail this test, even if the set of actions is identical.
- The file lives under `tests/cross-cutting/` to signal it is a pipeline-level invariant test, not a unit test of any single module.
