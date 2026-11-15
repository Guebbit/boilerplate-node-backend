---
source: src/modules/tasks/tests/unit/system-openings.test.ts
sha256: caf94b35cbe610265e55366af8f4727f1081b4ee3fb78625a5acaccf2c32a8ac
generated_at: 2026-11-14T22:18:22.992754+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/system-openings.test.ts

## Purpose

Unit tests for the system-owned task openings (`accountReviewOpening`, `exportFailedOpening`) and the `clear` helper defined in the tasks domain (`src/modules/tasks/domain/system.ts`). Verifies structural invariants—kind membership, declared route sets, dedup-key format, due-date offset, subject binding, and message privacy—using only pure in-memory values with no mocks or database.

## Key elements

- **`describe('the openings', …)`** — table-driven tests over two openings (account review, export failed).
  - Validates `opening.kind` is a declared `TaskKind` enum value.
  - Validates `opening.routeSet` exists in `PERMISSION_SETS`.
  - Confirms `openKeyOf` produces `kind:linkType:linkId`.
  - Asserts the specific route set (`UserBanning` / `UserErasure`) and link shape per opening.
  - Asserts `subjectId` is the person's id in both cases.
  - Asserts `dueAt` is exactly 72 h after the pinned `NOW`.
  - Asserts `message` contains no `@` (no free-text identity).
- **`describe('clear …')`** — verifies `clear(NOW)` returns a patch object: `set` with `status: 'resolved'`, `resolution: 'cleared'`, `closedAt`, and `unset: ['openKey']`.

## Relationships

- **`src/modules/tasks/domain/index.ts`** — barrel from which `accountReviewOpening`, `exportFailedOpening`, `openKeyOf`, `clear`, and `SystemOpening` are imported.
- **`src/modules/tasks/domain/system.ts`** — the module under test (per the file's doc comment); defines the opening factories and `clear`.
- **`src/modules/tasks/domain/lifecycle.ts`** — part of the same domain; likely defines or re-exports the `clear` patch-shape helper tested here.
- **`src/kernel/permissions.ts`** — provides `PERMISSION_SETS` used to assert that each opening's `routeSet` is a registered permission set name.
- **`src/types/index.ts`** — provides `TaskKind` and `TaskLinkType` enums used to validate opening kind and link type.

## Notes

- The fixed date `2030-05-01T10:00:00Z` is a module-level constant (`NOW`) shared across all assertions to keep the 72-hour due-offset check deterministic.
- The `it.each` table (`all`) keeps the two openings in a single array; adding a third system opening means appending one entry there and all structural checks run automatically.
- The message privacy check (`not.toMatch(/@/)`) is a project convention ensuring openings never embed a username or e-mail address in free text.
- `clear` returns a patch-shaped object (`{ set, unset }`) rather than a full record, implying the caller (a task store or reducer) applies it; the test only pins the shape, not persistence.
