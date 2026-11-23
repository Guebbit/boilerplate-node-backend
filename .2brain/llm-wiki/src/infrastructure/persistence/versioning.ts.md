---
source: src/infrastructure/persistence/versioning.ts
source_sha256: a091ee082a48d75487a40a106b77557963b911616618082f3ac3ea2e5c34849a
context_sha256: ee96aadd1a48e54a55c88e29417f23a1252d547d64f6eb32971322cc2db07c96
generated_at: 2026-11-22T03:05:18.106855+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/versioning.ts

## Purpose
Defines the "version" of a stored row and the `If-Match` write precondition that uses it. The version is `editRevision`, the counter that `./revision-plugin` bumps with an atomic `$inc` on every edit. It is not `updatedAt` or Mongoose's `__v`. Reads emit an `ETag` of the form `"<editRevision>.<digest>"`. Writes compare only the edit part, so a change that only alters the body bytes (e.g. a sale) doesn't reject an editor's open form.

## Key elements
- `Precondition`: `{ id, etags }`, where `etags` is a list of quoted tags or `'any'` for `If-Match: *`.
- `PreconditionFailedError`: thrown when the header no longer describes the stored row. The database-error interpreter turns it into a 412.
- `carryVersion(source, shaped)`: stores a row's version in a `WeakMap` keyed by the presenter-built wire object, so the ETag can still be derived after reshaping.
- `versionOf(row)`: reads the version from the carried map or from `editRevision`. Returns an integer or `undefined`.
- `etagOf(version, digest)`: builds `"<version>.<digest>"`.
- `versionOfTag(tag)`: parses the edit part of a tag. Returns `undefined` for weak tags or tags this API never issued.
- `runWithPrecondition(precondition, work)`: runs `work` inside an `AsyncLocalStorage` scope. If there is no precondition, it just runs `work`.
- `rearmPrecondition()`: marks the scope as unconsumed again so a retried transaction is checked again.
- `isLostRace(error)`: true for Mongoose `DocumentNotFoundError` or `VersionError`, matched by name.
- `fencedSave(document, write, key?)`: checks the loaded version against the caller's tags, then runs the save with a `$where` fence on the counter. A lost race becomes `PreconditionFailedError`.
- `preconditionFilter(key, path)`: returns a filter for query updates such as `updateOne`. It is `{ [path]: { $in: versions } }`, and `{}` if there is no precondition or it is `*`.
- `checkedDelete(document, write)`: the same check and fence for a document `deleteOne()`. A `deletedCount` of 0 becomes a 412.

## Relationships
- Imports `EDIT_REVISION` from `src/infrastructure/persistence/revision-plugin.ts`, which owns the counter this file reads and fences on.
- `src/infrastructure/http/preconditions.ts` and `src/infrastructure/http/errors.ts` are the other end of the flow. The controller opens the scope with the parsed header, and the error layer maps `PreconditionFailedError` to 412.
- `src/infrastructure/persistence/create-repository.ts` and module repositories such as `src/modules/locales/repository.ts` are where `save`, `deleteOne` and query updates meet the scope. They are the likely callers of `fencedSave`, `checkedDelete` and `preconditionFilter`.
- Presenters and serializers (`src/modules/example/presenter.ts`, `src/infrastructure/persistence/serialize.ts`) are where `carryVersion` is needed, since the counter isn't part of the wire shape.
- Services such as `src/modules/locales/services/*` and the account two-factor code deal with edits that live outside the row, or with concurrency. The concurrency test in `src/modules/account/tests/integration/two-factor-concurrency.test.ts` exercises this area.

## Notes
- The scope is consumed by the first matching write. A second save of the same row in one request is not checked, because its version is one the caller never saw.
- A write is checked only if its key equals `precondition.id`. Pass a custom `key` when the route addresses the row by something other than `_id` (e.g. a language tag).
- Writes that aren't edits (stock mirror, image digest, session tokens, password change, reaper warning) pass `timestamps: false` so they don't move the version. Edits stored outside the row move it by hand.
- Transactional retries must call `rearmPrecondition()` at the start of the work. Otherwise the retry would write unchecked.
- `preconditionFilter` treats version `0` as also matching a row with no counter (`null`). A header that parses to no version gives an empty `$in`, so the write is refused.
- `$where` is removed from the document once the write settles, so a later save of the same object doesn't filter on a stale counter.
- A write with no precondition, or one about another row, runs unchanged.
