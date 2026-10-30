---
source: scripts/scaffold/central-edits.ts
sha256: 9719156f0b92a148746815159b9a4b74bb77b91673c32d3a7e024843f77eb537
generated_at: 2026-10-29T01:41:45.992501+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/central-edits.ts

## Purpose

Defines the set of pure text-transform edits a newly scaffolded module requires in files **outside** its own directory. Each transform is anchored to a specific line; if the anchor is missing it throws immediately rather than silently skipping, so a reshaped target file blocks the scaffold before anything is written.

## Key elements

- **`CentralEdit`** (interface) — shape of one edit: a repo-relative `path` and an `apply(source) → string` function.
- **`centralEdits(names: ModuleNames)`** — returns the ordered array of all four central edits for a module.
- **`appendToList`** (internal) — inserts dash-prefixed items into the list block that follows an anchor line, up to the first blank line. Reuses the indentation of the last existing item.
- **`addParityEntry`** (internal) — inserts a row into the `known` table in the parity test, keeping rows alphabetical by entity name.
- **`entityOf`** (internal) — extracts the entity key from a table-row string.

## Relationships

- **`scripts/scaffold/names.ts`** — provides `permissionRules`, `permissionSetName`, and the `ModuleNames` type consumed here.
- **`scripts/scaffold/registry.ts`** — provides `registerModule`, used as the `apply` function for the `src/modules.ts` edit.
- **`scripts/scaffold/apply.ts`** — graph neighbor; the `CentralEdit[]` returned by `centralEdits` is the data it operates on to perform the actual file writes.
- **`tests/unit/scripts/scaffold/central-edits.test.ts`** — unit tests for the transforms exported by this file.

## Notes

- The four target files are: `src/modules.ts`, `shared/authorization-roles.yaml`, `shared/authorization-conformance.yaml`, and `tests/cross-cutting/replace-patch-parity.test.ts`.
- All transforms are **anchor-dependent**: if the anchor line has been renamed or removed, the edit throws with a descriptive message. Callers should treat that as a "manual intervention required" signal.
- `addParityEntry` inserts alphabetically by entity name and re-manages trailing commas on every row in the block.
- The YAML edits append items to existing `&admin_sets` / `&admin_permissions` anchors; they do not create those blocks from scratch.
