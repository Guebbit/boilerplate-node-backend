---
source: src/modules/orders/tests/integration/reencrypt.test.ts
source_sha256: 3f443d3a3b7d28c1fd49bd659d3c7265f576b8cd44e4959e2c30622aa7fe5312
context_sha256: 30c927a0c816f872a82fc237f365fd51b67071c53810b6bec4d9dd72f5166c46
generated_at: 2026-11-22T06:31:38.769176+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/reencrypt.test.ts

## Purpose
Integration tests for the orders module's `reencrypt` walk. After a PII key rotation (a new `v2` key placed ahead of the old `v1` key), encrypted order fields should be rewritten under `v2` and the order should still serialize and read back correctly. Raw collection reads bypass the repository's decrypt so the stamped key version can be checked directly.

## Key elements
- `ROTATED_PII_KEY` — `'v2:new-pii-key-material,v1:test-pii-encryption-key'`, simulating a deployment mid-rotation, with the worker's bare `v1` test key behind the new `v2` key.
- Test 1: creates an order with a shipping address and notes. After the module's `reencrypt(false)`, it expects `report.rewritten` to be 6. The raw `notes` must be stamped `v2`, and the reloaded order's `toJSON().shippingAddress.city` must still be `London`.
- Test 2: creates an order with a billing address including `vatNumber`. After reencrypt it expects `rewritten` to be 6. The raw `billingAddress.vatNumber` must be `v2`, and the reloaded JSON must return the original VAT number.
- Test 3: adds a staff note as an admin through the orders service. After reencrypt it expects `rewritten` to be 1. The raw `note_added` event must have its `text` stamped `v2`, and `timelineAs(id, asAdmin())` must still return the plaintext note.

## Relationships
- `ordersModule` (`../../module`) is the default export whose `reencrypt` method is under test.
- `orderModel` and `orderEventModel` (`../../model`) are used for raw collection reads (bypassing decrypt) and for `findById` reloads.
- `orderService` (`../../services`) provides `addNote`, which creates the timeline note in test 3.
- `keyVersionOf` (`@infrastructure/security/versioned-secret`) reads the key version stamped on a stored ciphertext.
- `createOrder`, `toOrderItem` and `timelineAs` (`../factories`), `createUser` (users factories) and `createProduct` (products factories) build the fixtures.
- `callerContextAs` and `asAdmin` (`@tests/callers`) supply admin caller contexts.
- `withEnvironmentOverrides` (`@tests/environment`) sets `NODE_PII_ENCRYPTION_KEY` for the duration of each reencrypt call.
- `setupTestDb` (`@tests/setup-test-db`) is called once at module level to prepare the test database.

## Notes
- Each order is created before the key override is applied, so its data is first encrypted under the default `v1` key. Reencrypt then runs inside the override.
- The `rewritten` counts (6 for an order, 1 for a timeline note) are asserted exactly. The tests don't show which fields make up those counts. Test 2 gets the same count as test 1 even though its fixture differs.
- `reencrypt(false)` is called with `false`. The file doesn't say what this argument means, though the module doc calls it the manifest's `reencrypt` walk.
