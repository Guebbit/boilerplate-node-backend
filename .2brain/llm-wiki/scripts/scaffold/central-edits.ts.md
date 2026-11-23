---
source: scripts/scaffold/central-edits.ts
source_sha256: 6fb40e77384eca64c0b5773090a38314eb227da6ee4f92c80b028ee3ef6b3f4e
context_sha256: a868a09ad9214a2ee2840807590442f77c9c827805e187d520d7af5401281283
generated_at: 2026-11-22T02:13:56.480927+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/central-edits.ts

## Purpose
Defines the edits a newly scaffolded module still has to make outside its own folder, expressed as pure text transforms (`source -> new source`). Each edit exists because some hand-maintained list must name the module. Every transform throws if its anchor is missing, so a file that changed shape aborts the scaffold before anything is written rather than being silently skipped.

## Key elements
- `CentralEdit` (interface): `{ path, apply }`, where `path` is repo-relative and `apply` maps the file's current text to its new text.
- `centralEdits(names)`: the exported entry point. Returns the edits in a stable order:
  1. `src/modules.ts`: registers the module via `registerModule`.
  2. `shared/rules/authorization-roles.yaml`: appends the module's permission-set name (`permissionSetName(names)`) to the list opened by the `sets: &admin_sets` anchor.
  3. `tests/cross-cutting/replace-patch-parity.test.ts`: adds an entry to the parity test's `known` table.
- `appendToList` (internal): finds the anchor line, extends the list up to the first blank line (or end of file), and appends `- item` lines using the indentation of the last existing line. Throws if the anchor is not found.
- `addParityEntry` (internal): inserts `Entity: 'kebab'` into the `const known: Record<string, string> = {` table in alphabetical order by entity. It rewrites trailing commas so only the last row has none. Throws if the table is not found.
- `entityOf` (internal): extracts the entity key from a table row.

## Relationships
- `names.ts`: supplies the `ModuleNames` type (`entity`, `kebab`) and `permissionSetName`, which produces the permission-set entry.
- `registry.ts`: `registerModule` performs the module-registration edit (import, array, `ModuleName`).
- `apply.ts`: the scaffold runner that consumes these `CentralEdit`s. The edits are pure and take the file text as input, so I/O stays out of this file.
- `tests/unit/scripts/scaffold/central-edits.test.ts`: unit tests for these transforms.

## Notes
- The header table lists two further conditional edits: `shared/cases/authorization.cases.yaml`, and the roles YAML and parity test, which apply only when the module has a permission set or a Replace/Update pair. `centralEdits` does not branch on `names` and returns no edit for `shared/cases/authorization.cases.yaml`. Only the three edits above are returned, each unconditionally.
- `appendToList` assumes the list ends at the first blank line after the anchor. The anchor is matched as a substring of a line, so the first match wins.
- `addParityEntry` hardcodes 12-space row indentation, and its table must end with a line that is exactly `};` after trimming.
