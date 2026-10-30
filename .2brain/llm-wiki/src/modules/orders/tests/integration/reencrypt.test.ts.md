---
source: src/modules/orders/tests/integration/reencrypt.test.ts
sha256: 552054185e8e7c243a86e7ab3439297c6257938a9c30526d6d3edb92ae7978d0
generated_at: 2026-10-29T04:55:45.984290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the orders module's `reencrypt` walk. Simulates a mid-rotation PII key deployment (v2 in front, v1 behind) and verifies that an existing order's encrypted fields (shipping address, notes) are rewritten from v1 to v2 while the order remains fully deserializable.

## Key elements

- **`ROTATED_PII_KEY`** — A composite key string (`v2:new-pii-key-material,v1:test-pii-encryption-key`) that simulates a rotation-in-progress environment for `NODE_PII_ENCRYPTION_KEY`.
- **`describe('orders reencrypt')` / single test** — Creates a user, product, and an order with a `shippingAddress` and `notes`, then calls `ordersModule.reencrypt(false)` inside `withEnvironmentOverrides`. Asserts:
  - `report.rewritten === 6` (six PII fields were re-stamped).
  - Reading the raw collection document (below the model's decrypt middleware) shows `keyVersionOf(raw.notes) === 'v2'`.
  - Reloading through `orderModel.findById` and calling `.toJSON()` still yields the correct `shippingAddress.city`.

## Relationships

- **`src/modules/orders/module.ts`** — The unit under test; the test calls `ordersModule.reencrypt(false)`.
- **`src/modules/orders/model.ts`** — Provides `orderModel` for both raw collection reads (`.collection.findOne`) and normal model-based reloads (`.findById`).
- **`src/infrastructure/security/versioned-secret.ts`** — Exports `keyVersionOf`, used to assert the version stamp on the raw encrypted blob without decrypting.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` swaps `NODE_PII_ENCRYPTION_KEY` for the duration of the assertion block.
- **`tests/support/setup-test-db.ts`** — Initializes the test database (called at module top-level).
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build the order fixture.
- **`src/modules/users/tests/factories.ts`** — `createUser` supplies the order owner.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the line-item product.

## Notes

- The test intentionally reads the **raw** Mongoose collection document (`orderModel.collection.findOne`) to inspect the version prefix *before* the model's decryption pipeline runs. This is the only way to confirm the stamp without a round-trip through `keyVersionOf` on a decrypted value.
- `reencrypt(false)` — the `false` argument is passed through to the module's internal walk; the test does not document its meaning here, so consult `module.ts` for the flag's contract.
- The expected `rewritten` count (6) is brittle to schema changes: adding or removing PII fields on an order will break the assertion.
