---
source: src/infrastructure/persistence/revision-plugin.ts
sha256: 9de53981a5fe3a1cd30281f53f0742a67d429ffd72bc98fe5ade155a5f2fdaff
generated_at: 2026-11-14T18:14:51.032315+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/revision-plugin.ts

## Purpose

Mongoose plugin that stamps an `editRevision` integer counter on a versioned row every time an editor's edit writes to it. It replaces Mongoose's `__v` with a domain-named key, increments it via `$inc` on `save` and query updates, and deliberately skips bookkeeping writes (`timestamps: false`) so the counter serves as a strong ETag validator (RFC 9110 §8.8.1).

## Key elements

- **`EDIT_REVISION`** (const) — The schema path string `'editRevision'`. Named to avoid colliding with the `locales` module's own `revision` wire field.
- **`revisionPlugin(schema)`** (exported fn) — Registers `versionKey` as `EDIT_REVISION`, then wires:
  - a `pre('save')` hook that calls `flagIncrement` when the document is not new and `updatedAt` was just stamped by Mongoose's timestamps hook;
  - `pre(['updateOne', 'updateMany', 'findOneAndUpdate'])` hooks that call `incrementOnUpdate`.
- **`flagIncrement(document)`** (internal) — Sets Mongoose's private version bit-field to the `VERSION_INC` flag *only* (not the version-filter flag), so the next `save()` emits `$inc` without a version-filter that would turn last-writer-wins into an error. Throws if Mongoose's internals have moved.
- **`incrementOnUpdate(query)`** (internal) — Reads the query's update; if it stamps `updatedAt` (i.e., it is an edit), appends `$inc: { editRevision: 1 }` (or a pipeline `$set` with `$add`/`$ifNull` for aggregation-pipeline updates).
- **`stampsUpdatedAt(update)`** (internal) — Detects whether any `$set` in the update touches `updatedAt`, the signal that Mongoose's timestamps hook treated the write as an edit.
- **`VERSION_INC`** (module-local const) — Read at runtime via `Reflect.get(Document, 'VERSION_INC')` to stay correct across Mongoose renumberings.

## Relationships

- **src/infrastructure/persistence/versioning.ts** — Consumes the `editRevision` value to derive ETags and perform `If-Match` comparisons; this plugin is the writer side of that contract.
- **src/infrastructure/persistence/serialize.ts** — Serialises persisted documents (including the `editRevision` field) for transport; the plugin guarantees the field exists and is a plain integer.
- **src/infrastructure/persistence/translatable-columns.ts** — Provides column metadata for schemas that the plugin is applied to.
- **src/modules/locales/model.ts** — The module whose existing `revision` wire field motivated the `editRevision` naming; also a consumer of the plugin.
- **src/modules/locales/controllers/update-locale-entries.ts** / **src/modules/locales/services/entries.ts** — Exercise the query-update path (`updateOne`/`findOneAndUpdate`) that the plugin's pre-update hooks intercept.
- **src/modules/orders/model.ts** — Schema that calls `revisionPlugin` to opt into the counter.
- **src/modules/products/model.ts** — Schema that calls `revisionPlugin` to opt into the counter.
- **src/modules/users/model.ts** — Schema that calls `revisionPlugin` to opt into the counter.
- **src/modules/webhooks/model.ts** — Schema that calls `revisionPlugin` to opt into the counter.
- **src/modules/example/model.ts** — Schema that calls `revisionPlugin` to opt into the counter.
- **tests/integration/persistence/revision.test.ts** — Integration tests that assert increment-on-edit and no-increment-on-bookkeeping; they also guard the private Mongoose bit-field access against upgrades.

## Notes

- The plugin must be applied **after** the schema is constructed with `timestamps: true`; it relies on the timestamps hook having already registered so that `updatedAt` visibility signals "this is an edit."
- Writes that pass `timestamps: false` (stock mirrors, digest refreshes, session-token rotations, password changes) are the **only** opt-out mechanism; the plugin does not inspect a caller-supplied options bag.
- `flagIncrement` deliberately sets a bit in Mongoose's private per-document version field. A Mongoose major upgrade that relocates this will throw at runtime with an explicit message rather than silently mis-versioning.
- Pipeline (aggregation) updates are handled by appending a `$set` stage using `$add`/`$ifNull` because pipeline syntax has no `$inc` operator.
- The plugin does **not** hook `Document#updateOne` (instance method) — only the Model/Query forms (`Model.updateOne`, `Model.findOneAndUpdate`, etc.) are expected in this codebase.
