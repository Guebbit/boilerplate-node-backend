---
source: src/infrastructure/persistence/revision-plugin.ts
source_sha256: 75d879984a2e4b455be3d8b8cb9862846abbf611db7001dc8182397851477518
context_sha256: c9704b4e3177936a7ce9a38d939e0e25d89d83ea93c274c8f70722803670ac69
generated_at: 2026-11-22T03:04:16.455561+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/revision-plugin.ts

## Purpose
Defines a Mongoose plugin that gives a schema an `editRevision` counter, an integer incremented atomically (`$inc`) on every real edit of a row. This counter is the row's version: the `ETag` is derived from it and `If-Match` is compared against it. A counter is used instead of `updatedAt` because a strong validator (RFC 9110 §8.8.1) must change on every change, and two edits in the same millisecond share a timestamp but never a counter.

## Key elements
- `EDIT_REVISION` (`'editRevision'`): the path holding the counter. It is not called `revision` because `locales` already has a wire field with that name and a different meaning.
- `revisionPlugin(schema)`: the exported plugin. It does three things:
  - Sets the schema's `versionKey` to `editRevision`, replacing `__v`.
  - Adds a `pre('save')` hook that calls `flagIncrement` when the document is not new and `updatedAt` is modified.
  - Adds a `pre` hook for `updateOne`, `updateMany` and `findOneAndUpdate` that runs `incrementOnUpdate`.
- `flagIncrement(document)` (internal): ORs Mongoose's `VERSION_INC` flag into the document's private internal version bit field. Mongoose then sends `$inc` without a version filter. It throws if Mongoose no longer keeps the flag there.
- `incrementOnUpdate` (internal): a query hook. It does nothing unless the update stamps `updatedAt`. For object updates it merges `editRevision: 1` into `$inc`. For pipeline updates it appends a `$set` stage that uses `$add` with `$ifNull(…, 0)`.
- `stampsUpdatedAt` (internal): detects a `$set.updatedAt` in an update, whether the update is an object or a pipeline.
- `VERSION_INC` (internal): read from `Document` via `Reflect.get` rather than hard-coded.

## Relationships
- Model files (`src/modules/example/model.ts`, `src/modules/locales/model.ts`, `src/modules/orders/model.ts`, `src/modules/products/model.ts`, `src/modules/users/model.ts` and `src/modules/webhooks/model.ts`) are listed as neighbors. They are the schemas this plugin versions.
- `tests/integration/persistence/revision.test.ts` is named in the source as the test that fails loudly if a Mongoose upgrade moves the private version flag.
- The other neighbors (`src/infrastructure/persistence/serialize.ts`, `src/infrastructure/persistence/translatable-columns.ts`, `src/infrastructure/persistence/versioning.ts`, `src/modules/locales/controllers/update-locale-entries.ts`, `src/modules/locales/services/entries.ts`, `tests/unit/app/process-boot.test.ts`) are not referenced in this file's code.

## Notes
- The plugin must be applied after construction to a schema with `timestamps: true`. It identifies an edit by whether Mongoose's timestamps hook stamped `updatedAt`, and it does not read the query options.
- Writes with `timestamps: false` (stock mirror, digest, session tokens, password change) do not stamp `updatedAt`, so they do not move the counter. An edit that changes nothing on the row stamps `updatedAt` by hand and does move it.
- `Document#increment()` is deliberately avoided. It sets both the increment and the version-filter flags, so a save would fail when the row moved. That would turn "no `If-Match`, last writer wins" into an error.
- Document-level `updateOne` and `deleteOne` are not hooked. Only the Model and Query forms are covered.
- The private Mongoose internals used by `flagIncrement` could break on a Mongoose upgrade.
