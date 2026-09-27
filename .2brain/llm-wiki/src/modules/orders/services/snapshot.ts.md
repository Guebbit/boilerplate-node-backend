---
source: src/modules/orders/services/snapshot.ts
sha256: 88c814ba01ecb51e057712b760caa424c0b1f306ca93cc78ac750a41864be21e
generated_at: 2026-09-27T15:16:15.458609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/snapshot.ts

## Purpose

Resolves catalogue product rows into the frozen order-line snapshots that every order writer embeds. It lives in `services/` (not `domain/`) because it deliberately depends on `@infrastructure/i18n` and `@kernel/translation`, which the domain tier is not allowed to touch.

## Key elements

- **`resolveSnapshotProducts(locale, products)`** — Resolves each product's translatable fields (`title`/`description`) into the caller-supplied `locale` via `resolveTranslations`, then overlays the result onto the original plain object. Returns the same-length array with translations applied where a translation row exists; products without a translation are returned unchanged.
- **`freezeOrderLines(locale, products, quantities)`** — Composes `resolveSnapshotProducts` with per-line assembly: strips `imageUrl`, `thumbnailUrl`, and `taxClass` from each product, resolves `taxClass` → `taxRate` via `resolveTaxRate`, and pairs the result with its `quantity` and the shared `locale`. Returns `OrderDocumentItem[]` ready for `OrderDocument.items`.

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `index.ts`, `catalog.ts`) — imports `runWithLocale` (locale binding) and `localeCandidatesFor` (candidate-list construction).
- **`@kernel/translation`** — imports `resolveTranslations` to fetch translated field rows by document ID.
- **`@modules/products`** (`index.ts`, `tax.ts`, `model.ts`) — imports `resolveTaxRate` and the `ProductSnapshot` type used as the input shape for `freezeOrderLines`.
- **`../model`** — imports the `OrderDocumentItem` type for the return shape of `freezeOrderLines`.
- **`../services/index.ts`** — barrel that re-exports these functions for other services.
- **`../services/place.ts`** — caller that invokes `freezeOrderLines` during order creation.
- **`../tests/unit/snapshot.test.ts`** — unit tests for both exports.

## Notes

- **Plain objects only.** Both functions expect already-plain product objects (`Lean` documents or `.toObject()` results). Passing a hydrated Mongoose document breaks the `{ ...product, ...fields }` spread. Never use `.toJSON()` — it converts `_id` to a string `id`, causing Mongoose to mint a fresh `_id` when the result is assigned into `orderLineProductSchema`, which silently breaks `orderRepository.search`'s `productId` filter.
- **Explicit locale binding.** `runWithLocale` binds the locale in the call scope rather than reading the ambient request locale. This is intentional for out-of-band order creation where the buyer's stored/requested locale may differ from the current request's negotiated locale.
- **Dropped fields are a contract.** `imageUrl`, `thumbnailUrl`, and `taxClass` are stripped by destructuring before the freeze. `taxRate` is the *resolved* value, not the class. Any new non-freezable catalogue field must be added to that destructuring list.
- **Single locale stamp.** `locale` is stamped once per line inside `freezeOrderLines`, making "all lines in an order share one locale" a structural guarantee rather than a repeated convention.
