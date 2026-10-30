---
source: src/modules/example/tests/unit/domain.test.ts
sha256: 86fcb64993591cc9c8cb15d0758771bf403a24d6ac7be3dc6d6b58985cef1e39
generated_at: 2026-10-29T03:58:10.917262+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/domain.test.ts

## Purpose

Unit tests for the example module's domain (lifecycle) rules: status transition validity, the `publishedAt` stamping policy, body-length ceiling, and per-status action availability. The file exists to pin down the pure, database-free logic in `src/modules/example/domain` so that transition or stamping regressions are caught before they reach integration or UI layers.

## Key elements

- **`describe('initialExampleStatus')`** — asserts the default status is `ExampleStatus.draft`.
- **`describe('canApply')`** — table-driven tests for the allowed and disallowed `(event, status)` pairs (publish, archive, unarchive across draft / published / archived).
- **`describe('statusAfter')`** — verifies the resulting status for each valid transition.
- **`describe('isPublished')`** — confirms only `published` returns true.
- **`describe('shouldStampPublishedAt')`** — verifies the stamp is set once on first publish, never overwritten, and not applied to draft/archived writes.
- **`describe('fitsBodyLength')`** — boundary tests: exactly-at-ceiling is accepted, one-over is refused.
- **`describe('exampleActionsFor')`** — checks the action-availability map for each status given edit permissions, and that a non-editing caller gets all actions `false`.

## Relationships

- **`src/modules/example/domain/index.ts`** — the barrel this file imports from (`../../domain`). All tested symbols (`canApply`, `exampleActionsFor`, `fitsBodyLength`, `initialExampleStatus`, `isPublished`, `shouldStampPublishedAt`, `statusAfter`) resolve through this re-export.
- **`src/modules/example/domain/lifecycle.ts`** — the implementation module behind the barrel; the tests exercise the transition and stamping logic that lives there (indirectly, via the barrel import).
- **`src/types/index.ts`** — provides the `ExampleStatus` enum used throughout the test expectations.

## Notes

- Tests are table-driven with `it.each` and `as const` tuples; when adding a new status or event, extend the arrays rather than adding individual `it` blocks.
- The domain is explicitly "no database" (per the file's module docblock). Do not mock a persistence layer here; only pure functions are in scope.
- `exampleActionsFor` tests always pass `{ update: true, delete: true }` except the final case, which verifies the all-false path for a caller without edit rights. The permission flags are independent of the status-based lifecycle flags.
