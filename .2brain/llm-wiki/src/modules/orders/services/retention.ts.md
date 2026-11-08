---
source: src/modules/orders/services/retention.ts
sha256: 5b3aae0196d347f86bae3d4cd87781ab2f412ac7862bdaba5139ef49b916511f
generated_at: 2026-11-08T07:00:31.090129+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/retention.ts

## Purpose

Implements the order-side of account erasure and data minimization. Because an order is an invoice retained under GDPR Art. 17(3)(b)/(e), erasure detaches the person (`userId`) from it rather than deleting it, then a later sweep scrubs the remaining PII once the legal claim window closes.

## Key elements

- **`detachUserId(userId, session)`** — `personalData.erase` hook. Unsets `userId` on every order for the account within the caller's transaction.
- **`startOrderPiiClock(userId)`** — `personalData.minimise` hook. Stamps a per-order PII retention timestamp while *keeping* `userId` so the customer still sees their history. Idempotent.
- **`anonymizeDueOrders()`** — The `reap:orders` sweep. Scrubs PII (addresses, notes) on all orders whose retention window has expired. Returns the count scrubbed.
- **`eraseUserOrders(userId, session)`** — The full `orders` erase hook. Reads unpaid-order IDs, detaches `userId`, clears timeline actor names, and **returns** a cancel thunk (type `AfterErase`) for the caller to execute *after* the erasure transaction commits.
- **`cancelUnpaidOrders(orderIds)`** *(private)* — Fires `cancelForErasureById` for each never-paid order in parallel. Never rejects; individual failures are logged and left to the reservation sweep's timeout as a backstop.

## Relationships

- **`../repository`** (`orderRepository`) — All persistence: `detachUserId`, `startPiiClock`, `scrubDueForAnonymization`, `findOpenUnpaidIdsOf`.
- **`../config`** — Supplies `orderPiiDaysAfterGuarantee()` and `orderPiiDaysUndelivered()` retention windows passed to the scrub query.
- **`./cancel`** (`cancelForErasureById`) — Cancels unpaid orders through the reservation-sweep path (releases stock hold, cancels payment intent).
- **`./timeline`** (`clearTimelineActor`) — Strips the erased user's name from timeline entries during erase.
- **`@infrastructure/adapters/logger`** — Structured info/warn/error logging on every operation.
- **`@kernel/registry`** — Provides the `AfterErase` type (a function the erasure orchestrator runs post-commit).
- **`../jobs`** — The `reap:orders` scheduled job calls `anonymizeDueOrders`.
- **`./index`** — Re-exports this module's public API for the orders service barrel.
- **`tests/integration/erasure.test.ts`** — Exercises the full erase → detach → cancel → sweep flow.

## Notes

- `eraseUserOrders` **returns** the cancel rather than executing it: stock and payment-intent mutations live in other modules and cannot participate in the erasure transaction, so they must run only after commit.
- Order IDs for the cancel are read *before* `detachUserId` unsets `userId`, since the detach would make them unfindable.
- `cancelUnpaidOrders` intentionally swallows per-order errors (log + continue); the reservation sweep's timeout (up to 168 h for bank transfers) is the safety net.
- `Stryker disable` comments suppress mutation-testing on log-only branches — do not remove them.
