---
source: src/modules/cart/factories.ts
sha256: 5da753ea502ad47ec46aa1cc478fc5e895421f0a5addba70a6b51a04f985852f
generated_at: 2026-09-23T18:30:22.473918+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/factories.ts

## Purpose

Factory for building cart fixtures ready to pass to `cartRepository.create`. It centralises the string-to-`ObjectId` conversion and the partial-document shape so that seed scripts and test setup don't each re-implement that logic. A cart is addressed solely by its owner (`userId`); no separate cart `_id` is produced here.

## Key elements

- **`CartOverrides`** (interface) — Input contract: required `userId: Id` (24-char hex string) and optional `items?: CartItem[]`. `CartItem` is imported from `@types` (owned by `openapi.yaml`), not re-declared.
- **`CartFixture`** (type) — Output contract: `Partial<CartDocument> & Pick<CartDocument, 'userId'>`. `userId` is non-optional by construction; every other field may be omitted.
- **`makeCart(overrides): CartFixture`** (function) — Converts `userId` and each `productId` to `Types.ObjectId`. Spreads `items` only when the array is provided, so an absent `items` key lets the Mongoose schema's `default: []` apply.

## Relationships

- **`src/modules/cart/model.ts`** — Source of the `CartDocument` type; `CartFixture` is a partial view of it, and `makeCart`'s return is shaped to satisfy `cartRepository.create`.
- **`src/types/index.ts`** — Provides the `Id` and `CartItem` type aliases used in the `CartOverrides` interface.
- **`src/modules/cart/tests/unit/factories.test.ts`** — Unit tests exercising `makeCart` against the expected fixture shape and ObjectId conversion.

## Notes

- **Omit `items` rather than passing `[]`.** The factory intentionally conditionally spreads the `items` key; passing an empty array would override the schema default and could change repository behaviour.
- **`userId` is required, not `Partial`.** The type makes it impossible to build a cart without an owner, removing the need for downstream non-null assertions in seed code.
- **IDs are strings in, `ObjectId`s out.** A bare hex string would silently match nothing in MongoDB queries; always go through `makeCart` (or an equivalent converter) before persisting or querying.
