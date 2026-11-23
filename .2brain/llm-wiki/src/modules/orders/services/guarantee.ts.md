---
source: src/modules/orders/services/guarantee.ts
source_sha256: 88790841209c7d7aeef9fc21ba8e484ff04b9bfd9121883c89c182d2a4761273
context_sha256: 6b87d59b8c3cf4b4a88da8918189679e8c1b2b8753b34e7dc39c13c62f0330df
generated_at: 2026-11-22T06:20:44.471729+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/guarantee.ts

## Purpose
Implements the legal-guarantee extension that follows a repair (Directive 2024/1799). When goods are repaired, the order's `conformityUntil` date moves twelve months on, once. The `returns` module asks for the extension; the `orders` module owns the field, so the write lives here.

## Key elements
- `extendGuarantee(orderId, session): Promise<boolean>`: the file's only export. It loads the order inside the caller's Mongoose `ClientSession`. It returns `false` and changes nothing if the order is missing, has no `conformityUntil`, or already has `conformityExtendedAt` set. Otherwise it calls the repository's `extendConformity` with the current and new deadlines and returns that call's result. The resolved boolean means "the guarantee was extended by this call".

## Relationships
- `src/modules/orders/domain/index.ts`: provides `repairedConformityUntil`, which computes the new deadline from the current `conformityUntil`.
- `src/modules/orders/repository.ts`: supplies `orderRepository`. Its `findInSession` method reads the order and its `extendConformity` method persists the new deadline.
- `src/modules/orders/domain/withdrawal.ts` and `src/modules/orders/services/index.ts` are graph neighbors, but this file does not reference them directly in its code.

## Notes
- It does not open its own transaction. The caller (the receipt's transaction) passes the `session`, so the extension commits or rolls back with the caller's work.
- The "once per order" rule is checked in this function through `conformityExtendedAt`. The file does not show how that field gets set, so it is presumably handled inside `extendConformity`.
- An order that never arrived has no deadline yet, so it quietly returns `false` instead of throwing.
