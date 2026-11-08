---
source: src/infrastructure/persistence/versioning.ts
sha256: 54ebcdda866efa21e1d9043eecb68b15f6ab8c7778b021ec811658877a305fdf
generated_at: 2026-11-08T03:45:27.096195+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/versioning.ts

## Purpose

Defines the optimistic-concurrency mechanism for conditional writes: it reads a row's `editRevision` counter, compares it against the caller's `If-Match` header, and fences the resulting `save()`/`deleteOne()` so a lost race surfaces as a `PreconditionFailedError` (→ 412) instead of a silent overwrite. It exists so that services and presenters never see HTTP headers or Mongoose internals — they just call `fencedSave`/`checkedDelete` and `carryVersion`.

## Key elements

- **`Precondition`** (interface) — the parsed `If-Match` for one row: the target `id` and the accepted etags (`readonly string[]` or `'any'` for `*`).
- **`PreconditionFailedError`** — thrown on mismatch or lost race; the HTTP error layer maps it to 412.
- **`carryVersion(source, shaped)`** — attaches a row's `editRevision` to a presenter-built wire object via a `WeakMap`, so `versionOf` still works after reshaping.
- **`versionOf(row)`** — returns the integer `editRevision` from a hydrated doc, a lean row, or a carried wire object; `undefined` if absent.
- **`etagOf(version)`** — formats a version as a quoted strong entity-tag per RFC 9110 §8.8.3.
- **`runWithPrecondition(precondition, work)`** — executes `work` inside an `AsyncLocalStorage` scope carrying the open precondition (or skips scoping when none is set).
- **`rearmPrecondition()`** — resets the `consumed` flag so a Mongoose transaction retry re-checks the tag against the row it just reloaded.
- **`isLostRace(error)`** — type-guard for Mongoose's `DocumentNotFoundError` and `VersionError` (the two "row moved" signals).
- **`fencedSave(document, write)`** — takes the open precondition, rejects early if the loaded version isn't accepted, then injects a `$where: { editRevision: <loaded> }` fence into the write so a concurrent edit makes the update match zero rows.
- **`checkedDelete(document, write)`** — same check-and-fence pattern for `deleteOne()`; additionally treats `deletedCount === 0` as a precondition failure.
- **`DeleteOutcome`** (interface) — the `{ deletedCount }` shape Mongoose's `deleteOne` resolves to.

## Relationships

- **`./revision-plugin.ts`** — provides the `EDIT_REVISION` field-name constant that every read/write in this file targets.
- **`src/infrastructure/http/preconditions.ts`** — parses the `If-Match` header into a `Precondition` and calls `runWithPrecondition` to open the scope for the request.
- **`src/infrastructure/http/errors.ts`** — interprets `PreconditionFailedError` and maps it to an HTTP 412 response.
- **`src/infrastructure/persistence/create-repository.ts`** — repository implementations wrap their `save`/`deleteOne` calls in `fencedSave`/`checkedDelete` so every module gets the check without per-module logic.
- **`src/infrastructure/persistence/serialize.ts`** — serialisation paths call `carryVersion` so the version survives the lean→wire reshape and is still available for `ETag` generation.
- **`src/modules/products/presenter.ts`, `src/modules/account/...presenter.ts`** — presenters call `carryVersion` when building wire objects from stored rows.
- **`src/modules/products/services/crud.ts`, `src/modules/orders/repository.ts`** — services that issue writes call `fencedSave`/`checkedDelete`; they call `rearmPrecondition` at the top of transactional work.
- **`src/kernel/translation.ts`** — shares the same `AsyncLocalStorage` ambient-context pattern (locale, caller, precondition) so none of the three leaks into service code.

## Notes

- The precondition is **consumed once per request per row** (`scope.consumed` flag). A second `save()` of the same document in the same request skips the check by design — the caller never saw the first write's new version.
- `armed()` removes `$where` from the document in a `.finally()`, because Mongoose keeps it on the document object and a subsequent `save()` of the same object would otherwise filter on a stale counter.
- `timestamps: false` writes (stock mirrors, image digests, session tokens) deliberately bypass the `editRevision` increment so they never invalidate an editor's open copy — this is a convention, not an enforcement in this file.
- `versionOf` returns `undefined` (not `0`) for unversioned rows; `accepts` only matches `etags === 'any'` for those, a concrete etag never will.
