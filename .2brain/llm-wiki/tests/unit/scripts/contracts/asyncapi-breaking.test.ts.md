---
source: tests/unit/scripts/contracts/asyncapi-breaking.test.ts
sha256: ca953a0fcc363ba49e457444db75927aa3da4685793e793e87cd3d598318becd
generated_at: 2026-11-08T10:32:15.263852+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/asyncapi-breaking.test.ts

## Purpose

Unit tests for the `breakingChanges` function that compares two AsyncAPI 3.0.0 documents and reports which structural changes would break existing subscribers. The tests verify that version-string edits are never flagged, that channel removals are flagged, and that an "acknowledged changes" list can suppress individual findings.

## Key elements

- **`document(version, channels?)`** — Local helper that builds a minimal valid AsyncAPI 3.0.0 document (one info block, optional channel map) so each test can focus on a single structural difference.
- **`describe('breakingChanges')`** — Suite of five cases exercising the imported function:
  - Bumping `info.version` alone produces no breaking changes.
  - Lowering the version (2.0.0 → 0.1.0) is also not treated as breaking.
  - Removing a channel that existed in the old document is reported with path `/channels/order.created`.
  - The same removal is still reported when the version string changes in the same diff.
  - Passing an `acknowledged` array (`[{ path, reason }]`) suppresses only that exact pointer; other genuine breaks (e.g. `/channels/order.paid`) are still returned.

## Relationships

- **`scripts/contracts/asyncapi-breaking.ts`** — The module under test. This file imports its sole export `breakingChanges` and calls it with pairs of AsyncAPI documents (and optionally an acknowledged-changes array). All assertions target the shape of the returned array of `{ path, … }` objects.
- **`tests/integration/erasure.test.ts`** — A related integration-level test that exercises the same contract-breaking logic end-to-end; this unit file isolates the comparison algorithm without I/O.

## Notes

- The helper hard-codes `asyncapi: '3.0.0'`; tests do not cover AsyncAPI 2.x documents.
- The "acknowledged" parameter is the third argument to `breakingChanges`; its shape is `{ path: string, reason: string }[]`. Only an exact `path` match is suppressed—sibling pointers are unaffected.
- Test assertions check the `path` field of each change object; the full object shape (other fields like `reason` or `kind`) is not asserted here, so the unit suite does not lock down the complete return schema.
