---
source: src/infrastructure/persistence/revision-plugin.ts
sha256: 9947de967a8d00626774d5471574fca7bbc5ca395a72e5d4862bc00c2c4ae955
generated_at: 2026-11-08T03:44:26.286364+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/revision-plugin.ts

## Purpose

A Mongoose schema plugin that installs an `editRevision` integer counter on a schema and atomically increments it on every "edit" write (save or query update that stamps `updatedAt`). The counter serves as the row's strong validator: it is the value from which the ETag is derived and against which `If-Match` is compared (RFC 9110 §8.8.1). It exists because Mongoose's built-in `__v` cannot be used—the codebase needs a counter that changes on every edit regardless of sub-millisecond timing, and it needs to be distinguishable from the `locales` wire field already named `revision`.

## Key elements

- **`EDIT_REVISION`** (`'editRevision'`) — the schema path holding the counter. Exported so other modules (e.g. `versioning.ts`) can reference the field by name without hard-coding the string.
- **`revisionPlugin(schema)`** — the exported Mongoose plugin. Sets `versionKey` to `EDIT_REVISION` (replacing `__v`) and registers `pre('save')` and `pre(['updateOne','updateMany','findOneAndUpdate'])` hooks.
- **`flagIncrement(document)`** (private) — sets Mongoose's internal `VERSION_INC` bit on `document.$__.version` so the next `save()` emits `$inc: { editRevision: 1 }` *without* a version filter. Throws if Mongoose's internals have moved.
- **`incrementOnUpdate(this: Query)`** (private) — for query updates, appends `$inc: { editRevision: 1 }` (single form) or a `$set`/`$add` stage (pipeline form). Only fires when the update stamps `updatedAt`, i.e. when Mongoose's timestamps hook treated it as an edit.
- **`stampsUpdatedAt(update)`** (private) — helper that inspects a single or pipeline update for a `$set` containing `updatedAt`.
- **`isRecord(value)`** (private) — type guard for plain objects.

## Relationships

- **`versioning.ts`** — consumes `EDIT_REVISION` (or the counter value it stores) to derive the ETag string and to compare `If-Match` headers. This plugin is what keeps the counter accurate; `versioning.ts` is what turns the counter into an HTTP-level validator.
- **Module models** (`example/model.ts`, `orders/model.ts`, `products/model.ts`, `users/model.ts`) — each calls `revisionPlugin(schema)` on its schema after construction to opt in to the counter.
- **`tests/integration/persistence/revision.test.ts`** — integration tests that exercise save-path and update-path increments, and that guard against Mongoose internal changes (e.g. `$__.version` relocation).
- **`serialize.ts`** — when a document is serialized for the wire, `editRevision` is part of the payload the client sees (used to build the ETag in responses).

## Notes

- The plugin must be applied **after** `timestamps: true` is set, because the hooks use "is `updatedAt` stamped?" as the definition of an edit. Schemas with `timestamps: false` (stock mirrors, digests, session tokens) are intentionally excluded from the counter.
- `flagIncrement` pokes Mongoose's private `$__.version` bitfield. There is no public API for "increment without a version filter." The test file is the safety net: it will fail on a Mongoose upgrade that restructures internals.
- `VERSION_INC` is read via `Reflect.get(Document, 'VERSION_INC')` at module load. If it is not a number, every subsequent save throws a descriptive error rather than silently skipping the increment.
- Pipeline updates do not support `$inc`; the plugin appends a `$set` stage using `$add`/`$ifNull` to handle rows that have no counter yet.
- The field is named `editRevision` (not `revision`) to avoid colliding with the `locales` wire field that already uses that name.
