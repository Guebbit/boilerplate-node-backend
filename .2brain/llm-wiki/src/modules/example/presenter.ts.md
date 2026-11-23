---
source: src/modules/example/presenter.ts
source_sha256: b26ca7ffeac6bb2d031d515dc62aeb144e612274a32832825504842ea61ee233
context_sha256: 9c4d1c6fa9287386b8b9c9cd75473e1657a73770df520c844b9829e8b569a350
generated_at: 2026-11-22T05:10:12.512599+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/presenter.ts

## Purpose
Turns a stored `example` record into the wire shape that `openapi.yaml` declares (`Example`), so every read and write returns the same thing. The only field a document cannot supply is `ownerName` (owned by `users`), and `actions` is decided by the caller's service and passed in rather than computed here.

## Key elements
- `presentExample(document, ownerName, actions)` — takes a Mongoose `ExampleDocument`, calls `.toJSON()` (applying the model's transform: `_id` to `id`, owner as hex), casts the result to `ExampleRow`, and adds `ownerName` and `actions`. Returns `Example`.
- `presentExampleRow(row, ownerName, actions)` — same output for a search row that is already in wire shape (`ExampleRow`); no `toJSON` step.
- `presentExampleExport(row, ownerName)` — builds an `ExportExample` for the account data export: `ownerName` is added, `actions` is omitted because it is per caller.

## Relationships
- `src/modules/example/model.ts` — supplies the `ExampleDocument` and `ExampleRow` types.
- `src/types/index.ts` (`@types`) — supplies the contract types `Example`, `ExampleActions` and `ExportExample`.
- `src/infrastructure/persistence/versioning.ts` — `carryVersion` is used by `presentExample` and `presentExampleRow` to wrap the assembled object.
- `src/modules/example/services/crud.ts`, `src/modules/example/services/owner.ts`, `src/modules/example/services/personal-data.ts` — these are the neighbors that supply the inputs the presenter documents: the owner's display name and the caller's `actions`. The file itself does not import them.

## Notes
- The single `as ExampleRow` cast on `document.toJSON()` exists because Mongoose types the result as `any`. The code comment says `toJSON` leaves no date or id object (see `serialize.ts`) and that the contract tests check the rest.
- The presenters only assemble data. They do not read `users` or decide permissions.
- The export variant deliberately has no `actions` and does not go through `carryVersion`.
