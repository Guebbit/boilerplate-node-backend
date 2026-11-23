---
source: src/infrastructure/persistence/serialize.ts
source_sha256: 4bf982935dcc89c332d0f6aeb75137549ff65c6cf069046b9a61d8d60ea073ee
context_sha256: 411bdfc9d036219cdd9188608e526d18e280ef78028aaa7a3a4ea183d5e57c7c
generated_at: 2026-11-22T03:04:45.906700+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/serialize.ts

## Purpose
Single place where a stored document becomes a wire payload: `_id` → `id`, `__v` dropped, nothing beyond what `openapi.yaml` declares. It serves two paths with one function: Mongoose `toJSON` (which already supplies `id` and drops `__v`) and the raw `.lean()`/`.aggregate()` path, which needs all steps done by hand.

## Key elements
- **`applySerialization(schema, options?)`**: builds a model's transform, registers it as the schema's `toJSON` option, and returns the transform so the model can export it for the lean/aggregate path. It is deliberately not a `schema.plugin()`, because a plugin's return value is discarded.
- **`SerializeTransform`**: type for a function that mutates a plain object into its wire shape and returns it.
- **`SerializeOptions`**:
  - `dropId`: delete `_id` instead of renaming it. Used only for `audit-logs`.
  - `omit`: top-level keys to strip.
  - `after`: model-specific hook for nested normalization, derived fields or formats.
  - `virtuals`: whether `toJSON` includes virtuals (default `true`).
  - `currency`: function that returns the currency used to pad money fields. Defaults to the document's own `currency`; products pass the live shop currency.
- **Transform order**:
  1. Handle `_id`/`id`.
  2. Delete `__v`.
  3. `stringifyDecimals`.
  4. `carryVersion`, then delete `EDIT_REVISION`.
  5. Strip `omit` keys.
  6. Run `after`.
  7. `padMoneyPaths` using the resolved currency string.
- **`textifyDatesAndIds`** (internal): walks plain objects and arrays in place, turning `Date`s into ISO text and `ObjectId`s into hex text. It uses `util.types.isDate` and the `_bsontype` tag rather than `instanceof`, so it works across realms and BSON copies.
- **`SerializableSchema`** (internal): structural type that needs only `set('toJSON', …)` plus `MoneyWalkableSchema`. It avoids Schema generics, which would restrict it to one model's document type.

## Relationships
- **`create-repository.ts`**: its `normalize` does the same steps by hand on lean/aggregate results, using the transform that `applySerialization` returns.
- **`money-field.ts`**: supplies `moneyPathsOf`, `padMoneyPaths`, `stringifyDecimals` and `MoneyWalkableSchema`.
- **`versioning.ts`**: `carryVersion` moves the edit counter beside the object so controllers can derive the `ETag`.
- **`revision-plugin.ts`**: exports `EDIT_REVISION`. This file reads it from the document and removes it from the wire shape.
- **Model files** (`account`, `addresses`, `api-keys`, `audit-logs`, `cart`, `delivery`, `example`, `inventory`, `locales`): call `applySerialization` on their schemas and export the resulting transform. `audit-logs` uses `dropId`.

## Notes
- In the `toJSON` path, `versionKey: false` removes the counter from the output, so the `toJSON` transform copies `EDIT_REVISION` from the document into the output before running the shared transform. `carryVersion` then picks it up.
- `textifyDatesAndIds` runs only on the `toJSON` path, after the model's `after` hook, which may still need real `Date`s (for example to cut a shop-day). The lean/list path keeps its `Date` objects because readers call `getTime()` on them.
- Money padding is last so `after` works on exact text and anything it adds is still padded. Padding is skipped if the schema has no money paths or the resolved currency is not a string.
