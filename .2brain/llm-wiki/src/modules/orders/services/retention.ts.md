---
source: src/modules/orders/services/retention.ts
sha256: 8c54f9943f28b48d3923273731bebcba84f8f59c18b817b6b308cb04218730e0
generated_at: 2026-09-27T15:15:35.478455+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/retention.ts

## Purpose
Implements the two-phase PII lifecycle for orders after an account is erased. Orders are treated as invoices (retained under GDPR Art. 17(3)(b)/(e)) rather than deleted; this file first detaches the user link, then later scrubs residual PII once a per-order retention window elapses.

## Key elements
- **`detachUserId(userId, session)`** — the `personalData.erase` hook (DDD-D6). Unsets `userId` on every order for the given account and stamps a per-order retention deadline. Joins the caller's transaction via the Mongoose `ClientSession`.
- **`anonymizeDueOrders()`** — the periodic sweep (invoked by `scripts/ops/reap-orders.ts`). Scrubs PII on orders whose stamped retention deadline has passed; returns the count of affected orders.
- Both functions are thin orchestrators: they read the retention window, delegate the DB work to `orderRepository`, and log a summary if rows were touched.

## Relationships
- **`repository.ts`** — all actual MongoDB operations (`detachUserId`, `scrubDueForAnonymization`) live here; this service adds env reading, transaction propagation, and logging.
- **`environment.ts`** — supplies `NODE_ORDER_PII_RETENTION_DAYS` (default 3650) via `environmentNumber`.
- **`logger.ts`** — structured info-level logs for both detach and anonymize events.
- **`module.ts`** — registers `detachUserId` as the `personalData.erase` hook so the DDD-D6 erasure pipeline calls it.
- **`services/index.ts`** — barrel re-exports both functions for external consumers.

## Notes
- The retention clock is **per-order** (`createdAt`), not from the erasure date. An order created 9 years before erasure has only ~1 year of remaining retention; one created yesterday has the full ~10 years. The logic for this per-order deadline lives in `orderRepository.detachUserId`, not here.
- `detachUserId` requires a `ClientSession` and must only be called inside the hard-delete transaction; calling it outside will not be atomic with the account deletion.
- Stryker mutation-testing suppressions are present on the `logger.info` lines (no behavioural effect if the log call is mutated).
- Neither function ever deletes or modifies order line items — only PII fields are unset/scrubbed.
