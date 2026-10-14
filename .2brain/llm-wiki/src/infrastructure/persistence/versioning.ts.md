---
source: src/infrastructure/persistence/versioning.ts
sha256: 54ebcdda866efa21e1d9043eecb68b15f6ab8c7778b021ec811658877a305fdf
generated_at: 2026-10-14T08:12:20.707676+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/versioning.ts

## Purpose

Implements optimistic-concurrency control for repository writes: it tracks each row's `editRevision` counter (maintained by `revision-plugin`) and enforces an HTTP `If-Match` precondition at the persistence layer so a write that lost a race matches nothing and surfaces as a 412 instead of silently overwriting. The mechanism is request-scoped via `AsyncLocalStorage`, so services and repositories never need to know a header existed.

## Key elements

- **`Precondition`** (interface) — the parsed `If-Match` header: the target row `id` and the accepted `etags` (array of quoted tags or `'any'` for `If-Match: *`).
- **`PreconditionFailedError`** — thrown when a write's tag no longer matches; the HTTP error interpreter maps it to 412.
- **`runWithPrecondition(precondition, work)`** — opens the `AsyncLocalStorage` scope so the first write inside `work` is checked; passes through unchanged when no precondition is sent.
- **`rearmPrecondition()`** — resets the `consumed` flag so a transactional retry re-checks the caller's tag against the freshly-loaded row.
- **`fencedSave(document, write)`** — checks the open precondition against the document's `editRevision`, then attaches a `$where` filter (the "fence") so the actual Mongoose `save()` is a no-op if the row moved between load and write. Translates Mongoose race errors to `PreconditionFailedError`.
- **`checkedDelete(document, write)`** — same check-and-fence pattern for `deleteOne()`; additionally rejects if `deletedCount` is 0.
- **`versionOf(row)`** — reads `editRevision` from a hydrated doc, lean row, or a presenter-built object that went through `carryVersion`.
- **`carryVersion(source, shaped)`** — stashes the source row's version into a `WeakMap` keyed by the presenter's output object, so the counter survives reshaping into a wire shape.
- **`etagOf(version)`** — formats the integer as a strong entity-tag (`"42"`), per RFC 9110.
- **`isLostRace(error)`** — type guard for the two Mongoose signals that the fence matched nothing (`DocumentNotFoundError`, `VersionError`).
- **`armed(document, write)`** (internal) — attaches `$where: { editRevision: <loaded value | null> }` to the document, runs the write, then removes the property so a second save on the same object isn't permanently fenced.
- **`takePrecondition(document)`** (internal) — retrieves and consumes the open precondition if it targets this document's `_id`.
- **`accepts(precondition, version)`** (internal) — returns true when the row's version is in the caller's accepted etag list (or etags is `'any'`).

## Relationships

- **`./revision-plugin`** — imports the `EDIT_REVISION` field-name constant; that plugin is responsible for incrementing the counter on every edit via an atomic `$inc`.
- **`src/infrastructure/http/preconditions.ts`** — produces the `Precondition` object (parsed `If-Match` header) that callers pass to `runWithPrecondition`.
- **`src/infrastructure/http/errors.ts`** — maps `PreconditionFailedError` to an HTTP 412 response; this file never sets a status code itself.
- **`src/infrastructure/persistence/create-repository.ts`** — wraps `fencedSave` / `checkedDelete` around the repository's `save()` and `deleteOne()` calls so all module repositories get the fence transparently.
- **`src/modules/orders/repository.ts`, `src/modules/products/services/crud.ts`, `src/modules/products/services/read.ts`** — downstream consumers whose writes flow through the fenced path (indirectly, via `create-repository`).

## Notes

- The precondition is **consumed on first use**: a second save of the same row within one request is not re-checked against the caller's tag, by design (the caller never saw the intermediate version). `rearmPrecondition()` exists specifically to undo this for transactional retries.
- `editRevision` is deliberately **not** `updatedAt` (millisecond collisions) and **not** Mongoose's `__v` (array-only). Non-editing writes (stock mirror, image digest, session tokens) pass `timestamps: false` so they don't bump the counter and won't invalidate an editor's copy.
- The `$where` fence uses `null` when the document has no counter yet; Mongo treats `null` as a literal match, so a brand-new row is still fenced correctly.
- `armed()` removes `$where` in a `.finally()`, because Mongoose keeps it on the document instance; without cleanup a second save on the same object would still filter on the stale counter.
- `carryVersion` + `versionOf` use a `WeakMap`, so the carried version is garbage-collected with the presenter output object and never leaks into serialization.
