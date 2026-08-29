# src/infrastructure/persistence/serialize.ts

## Purpose

Single serialization layer that converts a stored Mongoose document into its API wire payload. Exists because the OpenAPI contract (95 schemas with `additionalProperties: false`) demands a uniform shape — `_id` → `id`, `__v` removed, no undeclared keys — and two code paths (`toJSON` and raw `.lean()`/`.aggregate()`) each need it in a different way. This file provides one transform that serves both.

## Key elements

- **`SerializeTransform`** (type) — signature for a plain-object mutator that returns the wire-shaped record.
- **`SerializeOptions`** (interface) — per-model configuration: `dropId` (delete `_id` entirely; used only by `audit-logs`), `omit` (array of top-level keys to strip), `after` (arbitrary post-processing hook), `virtuals` (toggle Mongoose virtual inclusion in `toJSON`).
- **`SerializableSchema`** (interface, not exported) — structural type requiring only `set('toJSON', …)`. Avoids spelling Mongoose's generic `Schema<T>` which would reject or over-constrain the parameter.
- **`applySerialization`** (exported function) — builds the transform, calls `schema.set('toJSON', …)` to wire it into the Mongoose path, and **returns** the same transform so the model can export it for the lean/aggregate path. Not a `schema.plugin()` because the return value must be surfaced.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — calls the returned `SerializeTransform` inside its `normalize` step for `.lean()` and `.aggregate()` results (raw BSON where no `toJSON` virtuals or options are applied).
- **`src/modules/*/model.ts`** (account, audit-logs, cart, delivery, feedback, inventory, locales, orders, payments, products, users, wishlist) — each calls `applySerialization(schema, options)` once at model definition to wire `toJSON` and to obtain the exported serializer for the repository path.
- **`tests/cross-cutting/serialize.property.test.ts`** — property-based tests that exercise the transform against arbitrary document shapes to verify the invariant output contract.

## Notes

- The transform is intentionally idempotent across both call paths: it always writes `id` and deletes `__v` even though the `toJSON` path already gets those from `virtuals: true` / `versionKey: false`. The `after` hook runs **after** the `omit` loop, so it can reintroduce derived fields that `omit` stripped.
- The `transform` callback inside `schema.set('toJSON', …)` uses a single `as Record<string, unknown>` cast (not `as unknown as`). Mongoose types the serialized parameter from the raw document type, which is narrower than the string-keyed record, so one widening step suffices.
- `dropId: true` is currently only used by `audit-logs`, which has no addressable REST endpoint; the convention is that exposing an `id` there would invite one to be built.
