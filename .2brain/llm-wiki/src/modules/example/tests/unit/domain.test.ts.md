---
source: src/modules/example/tests/unit/domain.test.ts
sha256: 86fcb64993591cc9c8cb15d0758771bf403a24d6ac7be3dc6d6b58985cef1e39
generated_at: 2026-11-08T05:55:52.351745+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/domain.test.ts

## Purpose

Unit tests for the example domain's lifecycle rules and validation helpers. It locks down the state machine (which events are legal from which status), the `publishedAt` stamping invariant, the body-length ceiling, and the permission-aware action list — all without a database.

## Key elements

- **`initialExampleStatus` test** — asserts the default is `ExampleStatus.draft`.
- **`canApply` tests** — table-driven checks of allowed and refused `(event, status)` pairs across the three statuses.
- **`statusAfter` tests** — verifies the target status each event produces (`publish`→published, `archive`→archived, `unarchive`→draft).
- **`isPublished` test** — confirms only `ExampleStatus.published` satisfies the predicate.
- **`shouldStampPublishedAt` tests** — verifies the timestamp is set on first publish, never overwritten, and never set for draft/archived transitions.
- **`fitsBodyLength` tests** — boundary checks at and one-over the ceiling.
- **`exampleActionsFor` tests** — table-driven verification that the returned action map reflects both the current status and the caller's `update`/`delete` permissions.

## Relationships

- **`src/modules/example/domain/index.ts`** — the sole source under test; all functions (`canApply`, `exampleActionsFor`, `fitsBodyLength`, `initialExampleStatus`, `isPublished`, `shouldStampPublishedAt`, `statusAfter`) are imported from this barrel.
- **`src/types/index.ts`** — provides `ExampleStatus`, the enum used in every assertion and test-case tuple.
- **`src/modules/example/domain/lifecycle.ts`** — the implementation file behind the barrel; tests exercise its exported logic indirectly through the `domain/index` re-exports.

## Notes

- The `canApply` test table encodes the full transition matrix: there is no direct `published → archived → published` skip; you must `unarchive` back to `draft` first. The test comments call this out ("a published example is withdrawn by archiving it").
- `exampleActionsFor` is permission-aware: when both `update` and `delete` are `false`, **all** actions (including status transitions) are suppressed, not just the destructive ones. This is a product rule worth remembering when extending the action set.
- Tests use `it.each` with `as const` tuples to keep the expected/actual pairs visible at a glance and to get good failure messages.
