---
source: src/infrastructure/persistence/revision-plugin.ts
sha256: 9947de967a8d00626774d5471574fca7bbc5ca395a72e5d4862bc00c2c4ae955
generated_at: 2026-10-14T08:11:13.037489+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/revision-plugin.ts

## Purpose

Mongoose plugin that gives a schema a monotonically-incrementing `editRevision` counter and moves it atomically (`$inc: 1`) on every write the schema's `timestamps` option considers an edit. It exists to provide a strong, per-row validator (the basis for ETag / If-Match) that changes on every edit even when two edits land in the same millisecond, replacing Mongoose's `__v` with a domain-named field.

## Key elements

- **`EDIT_REVISION`** (exported const) — the string `'editRevision'`, the schema path and wire field name for the counter. Named to avoid a collision with `locales`' own `revision` field.
- **`revisionPlugin(schema)`** (exported) — the Mongoose plugin. Sets `versionKey` to `EDIT_REVISION`, then registers:
  - `pre('save')` hook — flags an increment (without a version filter) when the document is not new and `updatedAt` was stamped by the timestamps hook.
  - `pre(['updateOne', 'updateMany', 'findOneAndUpdate'])` hook (`incrementOnUpdate`) — appends an `$inc` or `$set { $add }` stage for `editRevision: 1` to the query update, but only when the update stamps `updatedAt`.
- **`flagIncrement(document)`** (private) — writes the `VERSION_INC` bit into Mongoose's private `document.$__.version` so that a subsequent `save()` sends `$inc` *without* a version filter (last-writer-wins semantics). Throws if Mongoose's internal layout changes.
- **`stampsUpdatedAt(update)`** (private) — inspects a single-object or pipeline update to determine whether `updatedAt` appears in any `$set`, which is the signal that Mongoose's timestamps hook treated the write as an edit.

## Relationships

- **`versioning.ts`** — consumes `editRevision` as the strong validator: derives the ETag from it and compares `If-Match` against it on read/conditional-write paths.
- **`serialize.ts`** — serializes/deserializes documents to the wire; `editRevision` is one of the fields it must carry.
- **`modules/*/model.ts`** (users, orders, products, example) — each applies `revisionPlugin` to its schema (with `timestamps: true`) to opt in to the counter.
- **`tests/integration/persistence/revision.test.ts`** — integration tests that exercise the save and query-update paths and assert the Mongoose internals assumption in `flagIncrement` still holds.

## Notes

- The plugin **requires** the target schema to have `timestamps: true`. It uses the presence of `updatedAt` in the update as its "is this an edit?" signal; schemas that set `timestamps: false` (stock mirrors, digest, session tokens) are deliberately excluded from the counter.
- `flagIncrement` reaches into Mongoose's private `Document.$__` bit field. If a Mongoose upgrade relocates or renames it, the function throws with a descriptive message — the integration tests in `revision.test.ts` are the safety net.
- For pipeline updates, the increment is expressed as a `$set` stage using `$add` + `$ifNull` (since pipeline updates have no `$inc` operator), and it gracefully handles rows that have no counter yet.
- `updateOne`/`deleteOne` **document-level** calls (as opposed to the Model/Query forms) are intentionally not hooked.
