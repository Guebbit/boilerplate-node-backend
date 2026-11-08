---
source: src/infrastructure/persistence/serialize.ts
sha256: 2f5ab4d3face88172de4bd2a9419cb33c1f14748199783a6aa236c899417491a
generated_at: 2026-11-08T03:44:58.427662+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/serialize.ts

## Purpose

Normalizes a stored Mongoose document into its wire/API payload shape in one place: renames `_id` → `id` (or drops it), removes `__v`, stringifies Decimal128 amounts, strips the internal edit-revision counter, pads money to the correct currency precision, and applies any model-specific extras. Because `.lean()`/`.aggregate()` return raw BSON without Mongoose's `toJSON` help, the same transform is returned for manual invocation.

## Key elements

- **`applySerialization(schema, options?)`** — sole exported function. Wires the transform into `schema.set('toJSON', …)` *and* returns it so the lean/aggregate path can call it directly.
- **`SerializeTransform`** — type alias: `(serialized: Record<string, unknown>) => Record<string, unknown>`.
- **`SerializeOptions`** — per-model knobs: `dropId` (delete `_id` entirely), `omit` (strip top-level keys), `after` (model-specific hook), `virtuals` (include/exclude virtuals in `toJSON`), `currency` (override the document's currency for money padding).
- **`SerializableSchema`** (internal) — structural interface requiring `set('toJSON', …)` plus `MoneyWalkableSchema`; avoids pinning to a generic `Schema<T>` that would only accept one model's document type.

## Relationships

- **`create-repository.ts`** — the lean/aggregate consumer; calls the returned `SerializeTransform` in its `normalize` helper.
- **`money-field.ts`** — supplies `moneyPathsOf`, `stringifyDecimals`, `padMoneyPaths`, and the `MoneyWalkableSchema` type that `SerializableSchema` extends.
- **`revision-plugin.ts`** — defines the `EDIT_REVISION` key; the transform deletes it from the wire object after `carryVersion` parks it beside the payload.
- **`versioning.ts`** — provides `carryVersion`, which moves the edit counter to a sibling position so controllers can derive `ETag`.
- **All `*/model.ts` files** (account, orders, cart, addresses, api-keys, audit-logs, delivery, example, inventory, locales, notifications) — each calls `applySerialization` on its schema at definition time, passing model-specific `SerializeOptions`.

## Notes

- Not a Mongoose plugin by design: a plugin discards its return value, but the transform must be exported for the lean/aggregate path. One direct call per model keeps both halves (toJSON wiring + exported serializer) on a single line.
- Money padding runs **last**, after `after`, so model hooks compute on exact decimal text and nothing they add escapes the currency's places.
- `currency` option exists for models that store no currency of their own (e.g. Products pass the live shop currency).
- The `toJSON` transform's first argument is the Mongoose document; it reads `EDIT_REVISION` from the document (since `versionKey: false` already stripped it from `serialized`) and re-injects it before delegating to the shared transform.
- `dropId` is used only by `audit-logs`, the sole collection with no addressable REST endpoint.
