---
source: scripts/docs/generate-role-matrix.ts
sha256: 6c29757123f18aa4dc87d8b92a6473bfe9e29c313c5ba835c82f7e6b6af24993
generated_at: 2026-10-01T12:30:31.077146+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Generates the effective role-permission matrix table inside `docs/demo-ecommerce/index.md`. The table answers "which keys does a role *actually* hold, per module" by calling the kernel's `heldKeys` (the same function a route guard uses), so the docs stay in lockstep with the enforcement logic. The answer is non-derivable by hand because `admin` holds most declared tenant keys and every tenant caller is floored at the anonymous baseline.

## Key elements

- **`checkOnly`** — set when `--check` is in `process.argv`; switches `applyMarkerBlocks` from rewrite to drift-report mode (used by the `complete` gate).
- **`roles`** — `[ANONYMOUS_ROLE, …PRESET_ROLES]` minus `system`. `guest` is included as the comparison baseline; `system` is excluded because it is `admin`'s list under an alias and is never operator-assigned.
- **`modules`** — unique module names from `PERMISSION_KEYS` in declaration order; these become the table's columns.
- **`callerFor(name, scope)`** — builds a `Caller` the evaluator would see, manually unioning the anonymous baseline for tenant-scope roles (mirrors what the kernel does in `keysInScope`).
- **`codes`** — maps action names to one-letter display codes (`read→r`, `create→c`, …) so a wide table fits the page.
- **`breadthOf(key)`** — extracts the breadth segment (second-to-last dot-separated part) to distinguish `any` vs `self`.
- **`cell(caller, module)`** — resolves one table cell: uppercase letter for `any`-breadth keys held, lowercase for `self`, `—` for none.
- **`effectiveTable()` / `body()`** — assemble the markdown table plus surrounding legend and reading-guide prose that sits between the marker comments.
- **`applyMarkerBlocks(…)` call** — writes the block into the page (or reports drift in `--check` mode) and sets `process.exitCode`.

## Relationships

- **`src/kernel/permissions.ts`** — source of `ANONYMOUS_ROLE`, `PERMISSION_KEYS`, `PRESET_ROLES`, `permissionsOfRole`, and `isUnrestricted`. The script reads the static key list and per-role permissions directly from here.
- **`src/kernel/ability.ts`** — provides `heldKeys`, the single authoritative expansion of "which keys does this caller hold." The script deliberately calls this rather than re-implementing the union logic locally.
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, which handles locating the `<!-- role-matrix:start/end -->` markers, replacing the block, and the `--check` drift-reporting contract.
- **`src/types/index.ts`** (re-exporting `src/types/auth-context.ts`) — supplies the `Caller` and `AuthorizationScope` type signatures used to construct and pass caller objects.

## Notes

- The script intentionally uses `heldKeys` (exact key set) instead of `holdsKey` (boolean), because the table must enumerate *which* keys are held, not just whether a role can do an action.
- `callerFor` replicates the anonymous-baseline union by hand because `callerInScope` requires an `AuthContext`/request that a build script has no reason to fabricate.
- `system` is filtered out of `roles` but *not* from the kernel's data; if it were rendered, its row would be a duplicate of `admin`.
- In `--check` mode the script exits non-zero on drift without touching the file, matching the convention used by the sibling `generate-module-graph.ts`.
