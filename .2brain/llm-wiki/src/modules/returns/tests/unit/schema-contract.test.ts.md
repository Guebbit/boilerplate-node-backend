---
source: src/modules/returns/tests/unit/schema-contract.test.ts
source_sha256: a0c80446eee05f45f2589fbacc78284ae6bc41d57d1751b51ba7bf01c0e36b03
context_sha256: ba36e156c7fbea4bb892192d6a30aa3bf31fefb8aba841fce568265a5e433cf9
generated_at: 2026-11-22T07:39:58.192743+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/schema-contract.test.ts

## Purpose
Unit test pinning the contract of `returnSchema`. It asserts which fields are required, that a return is keyed only by its order (no `userId` field, so account erasure can leave the record alone), and that the enums, defaults, and indexes are what the rest of the module expects.

## Key elements
- **`describe('returnSchema')`** with five tests:
  - **Required paths:** exactly `currency`, `kind`, `lines`, `openedBy`, `orderId`, `orderNumber`, `reason`, `requestedAt`, `returnPostage`.
  - **No person link:** `returnSchema.path('userId')` is checked with `toBeUndefined()`.
  - **Order reference:** `orderId` is type `ObjectId` and refs `Order`.
  - **Defaults and enums:**
    - `status` defaults to `requested`. Its values are `requested`, `approved`, `declined`, `received`, `closed`, `canceled`.
    - `reason` is one of `withdrawal`, `defective`, `wrong_item`, `other`.
    - `returnPostage` is `consumer` or `shop`.
    - `kind` defaults to `return`. Its values are `return` and `cancellation`.
  - **Indexes:** the index specs include `returns_orderId_createdAt` and `returns_status_createdAt`. These serve one order's returns and the staff queue.

## Relationships
- Imports `returnSchema` from `src/modules/returns/model.ts`, the schema under test. Changes to its fields, enums, defaults, or indexes must be matched here.
- Uses the helpers `enumOf`, `indexOptionSpecs`, `refOf`, `requiredPaths`, `typeOf`, and `defaultOf` from `tests/support/schema.ts` (imported as `@tests/schema`) to introspect the schema.

## Notes
- The required-path list and enum arrays are compared with `toEqual`, so order matters. Adding a required field or enum value without updating the test will fail it.
- The index check is a substring match on the joined specs, so it checks that the index names exist, not their key definitions.
- The module comment ties the no-`userId` design to GDPR erasure (Art. 17(3)(b)/(e)).
