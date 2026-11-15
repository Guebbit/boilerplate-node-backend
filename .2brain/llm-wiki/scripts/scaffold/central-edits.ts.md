---
source: scripts/scaffold/central-edits.ts
sha256: 6fb40e77384eca64c0b5773090a38314eb227da6ee4f92c80b028ee3ef6b3f4e
generated_at: 2026-11-14T17:39:44.790175+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/central-edits.ts

## Purpose

Defines the set of pure text-transform edits a newly scaffolded module must apply to files *outside* its own folder (the "central" files: the module registry, the admin authorization-rules YAML, and the Replace/PATCH parity test). Each transform is a `(source) => string` function that throws if its expected anchor is missing, so a drift in file shape is caught before anything is written.

## Key elements

- **`CentralEdit` (interface)** — Describes one edit: a repo-relative `path` and an `apply(source) → string` transform.
- **`appendToList(source, anchor, items)`** (internal) — Locates a list block by anchor line, appends dash-prefixed items before the next blank line, and preserves the block's indentation. Throws if the anchor is absent.
- **`entityOf(row)`** (internal) — Extracts the entity key from a parity-table row string.
- **`addParityEntry(source, names)`** (internal) — Inserts a new `Entity: 'kebab'` row into the `known: Record<string, string>` table in the parity test, keeping rows alphabetical by entity. Throws if the table is not found.
- **`centralEdits(names: ModuleNames): CentralEdit[]`** (export) — Returns the ordered list of edits for a module: the registry insertion (delegated to `registerModule`), the admin-sets YAML append, and the parity-table entry.

## Relationships

- **`scripts/scaffold/names.ts`** — Provides the `ModuleNames` type and the `permissionSetName` helper used to name the authorization set.
- **`scripts/scaffold/registry.ts`** — Provides `registerModule`, which serves as the `apply` function for the module-registry edit.
- **`scripts/scaffold/apply.ts`** — Consumes the `CentralEdit[]` array and `CentralEdit` interface to perform the actual file writes.
- **`tests/unit/scripts/scaffold/central-edits.test.ts`** — Unit-tests the transform functions and the `centralEdits` export.

## Notes

- The module doc-comment table lists **four** central files (including `shared/cases/authorization.cases.yaml`), but `centralEdits()` only returns **three** edits. The cases-YAML edit is either handled elsewhere or not yet implemented.
- All transforms are intentionally strict: a missing anchor throws rather than returning the source unchanged, so the caller can abort the scaffold cleanly.
- `addParityEntry` re-serializes trailing commas on every row of the `known` table (except the last), so it normalizes formatting each time it runs.
