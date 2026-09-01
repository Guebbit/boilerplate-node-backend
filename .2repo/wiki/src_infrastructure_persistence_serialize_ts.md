# src/infrastructure/persistence/serialize.ts

## Purpose

Single serialization boundary that converts a stored Mongoose document into its wire payload (the shape declared in `openapi.yaml`). It renames `_id` → `id`, drops `__v`, and strips caller-named keys. One function serves both serialization paths: Mongoose `toJSON` (where the framework already supplies `id`/drops `__v`) and raw `.lean()`/`.aggregate()` results (where the caller must perform every step manually via the returned transform).

## Key elements

- **`SerializeTransform`** (type) — `(serialized: Record<string, unknown>) => Record<string, unknown>`. The mutation-and-return signature shared by both the `toJSON` path and the lean/aggregate path.
- **`SerializeOptions`** (interface) — Per-model customization knobs:
  - `dropId` — delete `_id` entirely instead of renaming (used only by `audit-logs`).
  - `omit` — array of top-level keys to strip (secrets, contract-omitted fields).
  - `after` — model-specific hook for nested normalization, derived fields, or format adjustments.
  - `virtuals` — whether `toJSON` includes Mongoose virtuals (default `true`).
- **`SerializableSchema`** (interface, internal) — Structural type requiring only `set('toJSON', …)`. Avoids depending on Mongoose's generic `Schema<T>` which would pin the serializer to one model.
- **`applySerialization(schema, options?)`** (function, exported) — Builds the transform, wires it into the schema's `toJSON` (with `versionKey: false`), and **returns** the transform so the model can export it for the lean/aggregate path. Deliberately a direct call, not `schema.plugin()`, because the return value must propagate.

## Relationships

- **All `src/modules/*/model.ts` files** (account, audit-logs, cart, delivery, feedback, inventory, locales, orders, payments, products, users, wishlist) — Each model calls `applySerialization` once during schema construction, passing its `SerializeOptions`, and exports the returned `SerializeTransform` for use in `.lean()`/`.aggregate()` queries (e.g., via `normalize` in `create-repository.ts`).
- **`tests/cross-cutting/serialize.property.test.ts`** — Property-based tests exercising the transform contract (id renaming, `__v` removal, omit stripping, `after` hook ordering) against the shared function.

## Notes

- The `as Record<string, unknown>` cast inside the `toJSON` transform is a single widening step (Mongoose hands a narrower `{ _id, __v? }` type); the code comment explicitly avoids `as unknown as`.
- `dropId` is currently used by exactly one model (`audit-logs`) because that collection has no addressable endpoint; adding a second user would be a design smell.
- The `omit` loop carries an `eslint-disable` for `no-dynamic-delete` — this is intentional, as deleting caller-named keys from a plain record is the function's core job.
- The `after` hook receives the partially-processed object (after id/`__v`/omit steps), so it can rely on those being settled.
