---
source: scripts/scaffold/central-edits.ts
sha256: 9719156f0b92a148746815159b9a4b74bb77b91673c32d3a7e024843f77eb537
generated_at: 2026-11-08T02:57:43.241049+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/central-edits.ts

## Purpose

Defines the set of text edits a new module must make in files **outside** its own folder. Each edit is a pure `(source: string) => string` transform anchored to a known line; if the anchor is missing the transform throws, so a restructured target file blocks the scaffold rather than being silently skipped.

## Key elements

- **`CentralEdit`** (interface) — `{ path, apply }` pair describing one out-of-module edit.
- **`centralEdits(names: ModuleNames): CentralEdit[]`** — the sole public entry point; returns four edits in a fixed order: `src/modules.ts`, `shared/authorization-roles.yaml`, `shared/authorization-conformance.yaml`, and `tests/cross-cutting/replace-patch-parity.test.ts`.
- **`appendToList(source, anchor, items)`** (private) — inserts dash-prefixed lines after the first line containing `anchor`, stopping at the next blank line; auto-detects indentation from the preceding line.
- **`addParityEntry(source, names)`** (private) — inserts a row into the `const known: Record<string, string> = {` table in the parity test, keeping rows alphabetical by entity name.
- **`entityOf(row)`** (private) — extracts the key (entity name) from a parity-table row string.

## Relationships

- **`scripts/scaffold/names.ts`** — imports `permissionRules`, `permissionSetName`, and the `ModuleNames` type used throughout.
- **`scripts/scaffold/registry.ts`** — imports `registerModule`, which is used as the `apply` function for the `src/modules.ts` edit.
- **`scripts/scaffold/apply.ts`** — consumes the array returned by `centralEdits` to actually write the edits to disk during a scaffold run.
- **`tests/unit/scripts/scaffold/central-edits.test.ts`** — unit-tests the transforms in this module.

## Notes

- All four transforms are **fail-fast**: they throw on a missing anchor rather than returning the source unchanged. This is intentional so a renamed or restructured target file surfaces immediately.
- The edits are pure text operations with no filesystem access; the caller (`apply.ts`) is responsible for reading/writing files.
- `appendToList` assumes a single blank line terminates the list block; multi-blank-line or comment-separated lists would break the insertion point.
- The parity-table edit assumes 12-space indentation and a `};` closer line; both are hard-coded.
