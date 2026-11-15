---
source: src/infrastructure/persistence/versioning.ts
sha256: a55810f9e879008c8da3b92b14d93c043b375bbf5833f5e1b151f9fcd0dc2fc5
generated_at: 2026-11-14T18:15:36.245958+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/versioning.ts

## Purpose

Implements optimistic concurrency control for HTTP writes: it tracks a per-row integer counter (`editRevision`), builds and parses the `ETag` / `If-Match` entity-tags, and fences Mongoose `save` / `updateOne` / `deleteOne` calls so a stale client can never overwrite a newer edit. It runs in the infrastructure layer via `AsyncLocalStorage`, so controllers and services never need to spell out 412 logic themselves.

## Key elements

- **`Precondition`** – interface describing what an `If-Match` header asks of one row: the target `id` and the accepted entity-tags (or `'any'`).
- **`PreconditionFailedError`** – error class the HTTP error interpreter maps to **412**.
- **`scopeStorage`** (`AsyncLocalStorage`) – carries the open precondition and a `consumed` flag through the request call stack.
- **`carried`** (`WeakMap`) – attaches a version number to presenter-built wire objects so it survives reshaping.
- **`carryVersion(source, shaped)`** – copies a row's `editRevision` onto a wire object for later ETag derivation.
- **`versionOf(row)`** – reads the version from a hydrated doc, lean row, or carried wire object; returns `undefined` for unversioned rows.
- **`etagOf(version, digest)`** – formats the strong ETag `"<version>.<digest>"` per RFC 9110.
- **`versionOfTag(tag)`** – parses the integer version out of a quoted entity-tag.
- **`runWithPrecondition(precondition, work)`** – opens the precondition scope around a request's write path.
- **`rearmPrecondition()`** – resets the `consumed` flag so a transaction retry re-checks the caller's tag.
- **`isLostRace(error)`** – detects Mongoose `DocumentNotFoundError` / `VersionError` (the two ways a fenced write matches nothing).
- **`fencedSave(document, write, key?)`** – checks the open precondition against the loaded version, then fences `document.save()` via Mongoose `$where`; throws `PreconditionFailedError` on mismatch or lost race.
- **`preconditionFilter(key, path)`** – builds a `$in` filter for query-level `updateOne` fences; returns `{}` when no precondition applies.
- **`checkedDelete(document, write)`** – same check-and-fence pattern for `document.deleteOne()`; also throws when `deletedCount === 0`.

## Relationships

- **`revision-plugin.ts`** – source of the `EDIT_REVISION` constant and the atomic `$inc` plugin that increments the counter on every edit. This file imports `EDIT_REVISION` and relies on the plugin's semantics.
- **`preconditions.ts`** – parses the incoming `If-Match` header into a `Precondition` and calls `runWithPrecondition` to open the scope before the controller's work runs.
- **`errors.ts`** – the database-error interpreter that recognises `PreconditionFailedError` and responds with HTTP 412, so no controller must do so.
- **`create-repository.ts`** – wires `fencedSave`, `preconditionFilter`, and `checkedDelete` into the repository `save` / `updateOne` / `deleteOne` methods returned to modules.
- **`serialize.ts`** – calls `carryVersion` when reshaping stored rows into wire objects so the ETag can still be derived after serialization.
- **`src/modules/locales/repository.ts`** – a concrete consumer where the row key is a language tag rather than `_id` (the `key` parameter in `fencedSave` / `preconditionFilter`).
- **`src/modules/locales/services/translations.ts`** – edits that live outside the row (a translation) bump `editRevision` by hand, exercising the same version path.
- **`src/modules/example/presenter.ts`** – representative of presenters that build new wire objects and call `carryVersion` to keep the version available for ETag generation.
- **`two-factor-outcomes.ts`** – a non-edit write (password change, session tokens) that passes `timestamps: false` so it never invalidates an editor's open copy.
- **`two-factor-concurrency.test.ts`** – integration test that exercises the precondition fencing and lost-race detection under concurrent writes.

## Notes

- The version is **`editRevision`**, not `updatedAt` (collides within a millisecond) and not Mongoose's `__v` (only moves on array changes).
- The ETag has two parts: the **digest** changes with every byte (reads compare the whole tag for safe 304s); the **version** is the only part a write compares. A sale therefore never refuses an editor's open form.
- The precondition is **consumed once per row per request**. A second `save` of the same document in one request bypasses the check by design.
- `rearmPrecondition()` must be called at the start of `withTransaction` work; without it a driver retry would write unchecked over the very edit that caused the conflict.
- The `$where` fence is removed in a `.finally()` block after the write settles—Mongoose otherwise keeps it on the document and a subsequent save would filter on a stale counter.
- In `preconditionFilter`, version `0` also matches rows with no counter yet (Mongo `null` matches a missing field); a header that yields no parseable version produces an empty `$in`, matching nothing.
- The single registered header variant is `if-match-edit-version`; all other `If-Match` forms go through the standard etag path.
