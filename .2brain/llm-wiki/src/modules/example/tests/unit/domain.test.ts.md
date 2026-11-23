---
source: src/modules/example/tests/unit/domain.test.ts
source_sha256: 86fcb64993591cc9c8cb15d0758771bf403a24d6ac7be3dc6d6b58985cef1e39
context_sha256: fcc8a3b81c5029761157ae4c8886a26c38fd1e48985d5ef937422c2c5669b324
generated_at: 2026-11-22T05:14:46.131000+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/unit/domain.test.ts

## Purpose
Database-free unit tests for the example module's lifecycle rules. They cover which events each status allows, when `publishedAt` is stamped, the body-length ceiling, and which actions a caller sees for a given status.

## Key elements
- **`initialExampleStatus`**: must equal `ExampleStatus.draft`, so nothing is public until its owner publishes it.
- **`canApply(event, status)`**: the allowed transitions are:
  - `publish` from draft
  - `archive` from draft or published
  - `unarchive` from archived

  Every other combination is refused. A published example is withdrawn by archiving it, not by publishing again.
- **`statusAfter(event)`**: `publish` gives published, `archive` gives archived, and `unarchive` gives draft.
- **`isPublished(status)`**: true only for `published`. The test checks this by filtering every `ExampleStatus` value.
- **`shouldStampPublishedAt(status, publishedAt)`**: true only when the status is published and no stamp exists yet. It is false if a stamp is already set, and false for draft or archived.
- **`fitsBodyLength(body, max)`**: accepts a body exactly at the ceiling and refuses one character over.
- **`exampleActionsFor(status, { update, delete })`**: returns a flag object with `publish`, `archive`, `unarchive`, `update` and `delete`.
  - For a caller who may edit, the event flags follow `canApply` for that status.
  - `update` and `delete` are passed through from the caller's permissions.
  - For a caller with no edit rights, every flag is false.

## Relationships
- Imports `canApply`, `exampleActionsFor`, `fitsBodyLength`, `initialExampleStatus`, `isPublished`, `shouldStampPublishedAt` and `statusAfter` from `src/modules/example/domain/index.ts` (via `../../domain`). The lifecycle logic in `src/modules/example/domain/lifecycle.ts` is the likely source of the status and event rules, but that is not visible from this file.
- Imports `ExampleStatus` from `src/types/index.ts` (via the `@types` alias). It supplies the `draft`, `published` and `archived` values used as inputs and expectations.

## Notes
- The tests are pure, with no database or fixtures. They use `it.each` tables to cover the transition matrix.
- The `canApply` tables list every allowed and refused pair.
- Describe and test names carry the rationale, such as why a published example cannot be re-published.
