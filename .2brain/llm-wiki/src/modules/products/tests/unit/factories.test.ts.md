---
source: src/modules/products/tests/unit/factories.test.ts
sha256: c21b25232c08f6a5e6c573a00aea150d48afaead8027b858e985317a8c73a9c8
generated_at: 2026-11-08T07:54:00.999843+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeProduct` catalogue fixture builder. They pin down the override/defaults contract: which fields are required, how `stripUndefined` interacts with Mongoose `default:` values, how falsy overrides are preserved, and how soft-delete dates are coerced. Because `scenarios/products.ts` reuses `makeProduct` to seed the shipped demo catalogue, these tests also guard the live seed path.

## Key elements

- **`describe('makeProduct')`** — the sole suite; every case calls `makeProduct` (imported from `@modules/products/factories`) with various override shapes and asserts on the resulting document.
- **Bare-fixture test** — verifies the two schema-required fields (`title`, `price`) are present and an `_id` is generated, so *any* downstream `makeProduct()` call yields a valid document.
- **`id` override test** — confirms a supplied hex string becomes the document's real `ObjectId`.
- **Override-replaces-default test** — `title` and `price` can be swapped to arbitrary values.
- **`stripUndefined` / omitted-field test** — asserts that keys a caller did *not* supply (`active`, `onHand`, `reserved`, `categories`, `tags`, `description`) are **not present** on the object, so Mongoose defaults still fire.
- **Falsy-override test** — `active: false` and `onHand: 0` survive; the stripping logic keys on `undefined`, not falsiness.
- **`deletedAt` coercion test** — an ISO-string input is stored as a `Date` instance.
- **Timestamp derivation test** — when no explicit `createdAt` is given, the fixture back-fills it from the `ObjectId`'s embedded 32-bit timestamp.

## Relationships

- **`src/modules/products/factories.ts`** — the single production dependency. This file imports `makeProduct` and asserts its output shape; it does not import anything else from the factory module.

## Notes

- The stripping rule is the most load-bearing behavior: a key present as `undefined` would block Mongoose's `default:` from applying. Tests explicitly verify the key is *absent*, not merely `undefined`.
- The `HEX` constant (`65dc8a99604c307b702b5ccc`) is a fixed `ObjectId` used across three tests; its 32-bit timestamp prefix is what the "dates from its own id" test depends on.
- The file's module doc comment warns that a defect in `makeProduct` propagates into the shipped demo catalogue via `scenarios/products.ts`—these tests are therefore a guard for production seed data, not just unit-level assertions.
