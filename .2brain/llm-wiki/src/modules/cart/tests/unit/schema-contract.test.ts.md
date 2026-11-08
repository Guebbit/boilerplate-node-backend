---
source: src/modules/cart/tests/unit/schema-contract.test.ts
sha256: f55e20295cba1590c3d80c47aa956609d0f5ae9b224e4d1d890ab127371a3862
generated_at: 2026-11-08T05:25:24.451312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose

Locks down the Mongoose schema contract for the cart so that structural drift (a missing field, a dropped index, a relaxed constraint) is caught at test time. It asserts *what the schema is*—required paths, types, refs, index specs, defaults, and sub-schema shape—rather than testing behavior.

## Key elements

- **`RETENTION_SECONDS`** – Derived at import time from `currentEnvironment().NODE_CART_RETENTION_DAYS` (default 365) so the TTL assertion tracks the configured value rather than a hard-coded number.
- **`describe('cartSchema')`** – Seven tests on the top-level schema: required paths (`userId` only), `unique` index on `userId`, `items` defaults to `[]`, `userId` is `ObjectId` ref → `User`, exact index set (TTL, `items.productId`, `userId`), TTL `expireAfterSeconds` on the correct index, and `timestamps: true`.
- **`describe('cartSchema — a line')`** – Three tests on the `items` sub-schema: required fields are `productId` + `quantity`, `_id` is disabled, no `ref` on `productId`, `quantity` has `min: 1`, and the sub-schema exposes exactly two path names.
- **Test helpers** (`defaultOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathNames`, `pathOptions`, `refOf`, `requiredPaths`, `subSchema`, `typeOf`) – Thin introspection utilities that read Mongoose schema internals without instantiating documents.

## Relationships

- **`src/modules/cart/model.ts`** – Source of `cartSchema`, the sole object under test.
- **`tests/support/schema.ts`** – Provides every schema-introspection helper imported by this file.
- **`src/infrastructure/config/store.ts`** – Supplies `currentEnvironment()` so the TTL assertion reads the live `NODE_CART_RETENTION_DAYS` value instead of a literal.

## Notes

- The TTL test compares against `RETENTION_SECONDS` (env-derived) rather than a constant, so changing `NODE_CART_RETENTION_DAYS` moves both the runtime policy and the expectation in lockstep. The test also pins the TTL to the `updatedAt` index specifically, not any index.
- The test explicitly asserts `refOf(item, 'productId')` is `undefined`. This is a deliberate architectural constraint: cart-item → product resolution goes through `productService`, never Mongoose `populate()`.
- `min: 1` on `quantity` encodes the rule that a zero-quantity line is a bug (a "removal that did not remove"); correct removal is deleting the array element.
- The `unique: true` index on `userId` is what makes every cart mutation a single `findOneAndUpdate({ upsert: true })` with no prior read—no application-level locking needed.
