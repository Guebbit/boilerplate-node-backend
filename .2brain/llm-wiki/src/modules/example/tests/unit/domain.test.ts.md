---
source: src/modules/example/tests/unit/domain.test.ts
sha256: d75462b81a33f2c39138006748062751d1386e6c5ffd568cf695ab509f0ef936
generated_at: 2026-10-14T15:48:27.286785+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/domain.test.ts

## Purpose

Unit tests for the example domain's lifecycle rules: which status transitions are legal, when `publishedAt` gets stamped, and the body-length ceiling. Pure logic assertions with no database or network involvement.

## Key elements

- **`describe('initialExampleStatus')`** — Asserts the constant is `ExampleStatus.draft` (nothing is public by default).
- **`describe('canTransition')`** — Table-driven (`it.each`) checks of the state machine: four allowed transitions, two forbidden ones (you archive a published example rather than revert to draft; you cannot un-archive to published), and self-transitions for all statuses (supports idempotent PUT).
- **`describe('isPublished')`** — Verifies that only `ExampleStatus.published` satisfies the predicate across all enum values.
- **`describe('shouldStampPublishedAt')`** — Confirms the stamp fires on first transition to `published` when the field is empty, is never overwritten once set, and is skipped for `draft`/`archived` writes.
- **`describe('fitsBodyLength')`** — Boundary tests: accepts a body exactly at the ceiling, rejects one character over.

## Relationships

- **`src/modules/example/domain/index.ts`** (via `../../domain` import) — The module under test. Exports `canTransition`, `fitsBodyLength`, `initialExampleStatus`, `isPublished`, and `shouldStampPublishedAt`, all consumed here.
- **`src/modules/example/domain/lifecycle.ts`** — Implementation home for the transition and stamping logic exercised by these tests.
- **`src/types/index.ts`** (via `@types` import) — Source of the `ExampleStatus` enum used throughout the assertions.

## Notes

- Transition tests are table-driven with `it.each` to keep each case a single line; add new allowed/forbidden pairs there rather than writing new `it` blocks.
- The self-transition case iterates `Object.values(ExampleStatus)` — if a new status is added to the enum, it is automatically covered.
- `fitsBodyLength` is inclusive at the ceiling (`len === max` passes, `len === max + 1` fails); the function signature is `(body: string, max: number) => boolean`.
