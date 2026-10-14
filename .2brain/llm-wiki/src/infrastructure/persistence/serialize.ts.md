---
source: src/infrastructure/persistence/serialize.ts
sha256: 08192f7b0e76be9df9b2276a7eacf89acd22e728fc9b096fc785fda4abd6d2ff
generated_at: 2026-10-14T08:11:55.707283+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/serialize.ts

## Purpose

Single point where a stored Mongoose document is converted into its wire/API payload. Handles the `_id` → `id` rename, `__v` removal, Decimal128 revival, edit-revision stripping, and per-model customisations. One function serves both serialisation paths: Mongoose's `toJSON` (which partially does the work) and raw BSON from `.lean()` / `.aggregate()` (which needs all steps applied manually by `create-repository.ts`).

## Key elements

- **`SerializeTransform`** (type) — signature of the transform: mutates a plain record into wire shape and returns it.
- **`SerializeOptions`** (interface) — per-model knobs passed to `applySerialization`: `dropId` (delete `_id` entirely), `omit` (extra top-level keys to strip), `after` (arbitrary post-processing callback), `virtuals` (toggle Mongoose virtuals in `toJSON`).
- **`SerializableSchema`** (interface, not exported) — minimal structural type (`set('toJSON', …)`) that avoids the generics problem of importing Mongoose's `Schema` type directly.
- **`applySerialization`** (exported const) — builds the shared transform, wires it into the schema's `toJSON` option, and **returns** the transform so the caller can reuse it on the lean/aggregate path. One call gives both halves.

## Relationships

- **`create-repository.ts`** — calls the returned `SerializeTransform` inside its `normalize` helper for the `.lean()` / `.aggregate()` code path.
- **`money-field.ts`** — provides `reviveDecimals`, invoked inside the transform to convert Decimal128 fields to plain numbers.
- **`revision-plugin.ts`** — exports the `EDIT_REVISION` key constant; the transform deletes that key and re-reads the counter from the Mongoose document during `toJSON`.
- **`versioning.ts`** — provides `carryVersion`, which moves the edit-revision counter out of the serialised object so controllers can still derive `ETag` headers.
- **Module model files** (`account`, `addresses`, `api-keys`, `audit-logs`, `cart`, `delivery`, `example`, `feedback`, `inventory`, `locales`, `notifications`) — each calls `applySerialization` with its own `SerializeOptions` to wire its schema and export its serializer.

## Notes

- `audit-logs` is the only model that sets `dropId: true` (no addressable endpoint; exposing an id would invite one to be built).
- Deliberately **not** a Mongoose `schema.plugin()`: a plugin's return value is discarded, but the transform must be returned so the lean/aggregate path can use it. Calling `applySerialization` directly keeps both the `toJSON` wiring and the exported serializer on one line per model.
- Inside the `toJSON` transform, `versionKey: false` already removes the revision counter from `serialized`; the code re-reads it from the Mongoose `document` argument and re-assigns it before the shared transform runs.
- The `omit` loop uses `Reflect.deleteProperty` with an eslint-disable for `no-dynamic-delete` — the keys are caller-supplied, so static analysis can't verify them.
