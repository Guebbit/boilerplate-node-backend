# src/modules/cart/fixtures.ts

## Purpose

Factory for building cart fixtures that are safe to pass to `cartRepository.create`. It pins a stable `_id` (via `identityOf`) so that `scripts/export-demo-dataset.ts` can hash-compare the committed `demo-data.json` without the artefact going stale on every run, and it converts string ids to `ObjectId` instances so Mongo lookups actually match.

## Key elements

- **`CartOverrides`** (interface) — input shape for `makeCart`. Extends `FactoryIdentity` (from `@infrastructure/persistence/fixtures`), adds a **required** `userId: Id` and an optional `items?: CartItem[]`.
- **`CartFixture`** (type) — output shape: `Partial<CartDocument> & Pick<CartDocument, 'userId'>`. `userId` is non-optional so callers never need a `!` assertion.
- **`makeCart`** (function) — the single builder. Accepts `CartOverrides`, returns a `CartFixture`. Converts `userId` and each `productId` from string → `Types.ObjectId`. Omits the `items` key entirely when no lines are supplied, letting the schema's `default: []` apply.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — source of the `identityOf` helper and `FactoryIdentity` type; `makeCart` delegates all identity-field handling to them.
- **`src/modules/cart/model.ts`** — provides the `CartDocument` type that `CartFixture` is built against.
- **`src/types/index.ts`** — source of the `CartItem` and `Id` types used in the interface signature.
- **`src/modules/cart/demo.ts`** — consumes `makeCart` to seed the demo dataset.
- **`src/modules/cart/tests/unit/fixtures.test.ts`** — unit-tests the builder's output shape and ObjectId conversion.

## Notes

- **Id conversion is mandatory.** A bare 24-char hex string will silently match nothing in Mongo; `makeCart` is the single place that wraps them in `Types.ObjectId`.
- **`items` is deliberately omitted, not set to `[]`.** Spreading an empty array would override the schema default and change the serialized document shape.
- **`userId` is required, not optional.** Making it optional under `Partial` previously forced a `fixture.userId!` assertion in `demo.ts` for a value that was never actually absent.
