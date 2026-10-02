---
source: scripts/scaffold/central-edits.ts
sha256: 7eec00971cb02683bc6517cbb27a7825c806163805b32b2cd4676ec44e1284c3
generated_at: 2026-10-01T12:38:41.206440+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/central-edits.ts

## Purpose

Defines the set of pure text-transform edits a newly scaffolded module must apply to four files **outside** its own folder (the module registry, two authorization YAML files, and a cross-cutting parity test). Each transform locates a known anchor in the target file and inserts the module's entries, throwing immediately if the anchor is missing so the scaffold aborts before any write.

## Key elements

- **`CentralEdit` (interface)** — Describes one edit: a repo-relative `path` and an `apply(source: string): string` function.
- **`centralEdits(names: ModuleNames): CentralEdit[]`** — Main export. Returns the four edits in a fixed order: `src/modules.ts` → `shared/authorization-roles.yaml` → `shared/authorization-conformance.yaml` → `tests/cross-cutting/replace-patch-parity.test.ts`.
- **`appendToList(source, anchor, items)`** (internal) — Appends `- item` lines into the block that follows an anchor line, stopping at the first blank line. Detects indentation from the last existing line in the block.
- **`addParityEntry(source, names)`** (internal) — Inserts a new row into the parity test's `known` table, maintaining alphabetical order by entity name.
- **`entityOf(row)`** (internal) — Extracts the entity key (text before the first `:`) from a parity-table row string.

## Relationships

- **`scripts/scaffold/names.ts`** — Provides `permissionKeys()` (builds the permission-key strings for the YAML edits) and the `ModuleNames` type used throughout.
- **`scripts/scaffold/registry.ts`** — Provides `registerModule()`, which is the `apply` function for the `src/modules.ts` edit.
- **`scripts/scaffold/apply.ts`** — Consumes the `centralEdits` array to actually read/write the four target files during a scaffold run.
- **`tests/unit/scripts/scaffold/central-edits.test.ts`** — Unit tests for the transforms in this file.

## Notes

- Every transform is **fail-fast**: if its anchor string is not found in the target file, it throws an `Error` rather than silently skipping. A shape change in any of the four central files will therefore block the scaffold.
- The four target files and their anchors are **hardcoded** in `centralEdits`. Adding a fifth central file requires editing this file.
- `appendToList` relies on a blank line to delimit the end of the list block; if the YAML structure changes to use a different delimiter, the transform will misbehave before it even throws.
- `addParityEntry` re-inserts trailing commas based on row position, so the parity table must use a `const known: Record<string, string> = { … };` shape with one entry per line.
