---
source: src/modules/orders/services/retention.ts
source_sha256: d95292104ff5ca05dabe27a02bf5127f3ed510283b752a9ec952f8a4f4b65549
context_sha256: 1ede723bfaba70eb1e8a914f96d23fcd1380b28c133ed1a6d522b7b793e28d54
generated_at: 2026-11-22T06:23:13.854690+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/retention.ts

## Purpose
Defines what happens to orders when an account is erased or goes inactive. Orders are kept as invoices (GDPR Art. 17(3)(b)/(e)), so erasure detaches the user from them and starts a PII clock. A later sweep scrubs the remaining PII once each order's claim window has closed.

## Key elements
- `detachUserId(userId, session)` — the `personalData.erase` hook. Unsets `userId` on the account's orders through the repository, within the caller's transaction, and starts each order's PII clock. Logs the count if any were detached.
- `startOrderPiiClock(userId)` — the `personalData.minimise` hook for inactive accounts. Starts the same PII clock but keeps `userId`, so the customer still sees their order history. Idempotent: orders that already have a clock are skipped.
- `anonymizeDueOrders()` — the sweep behind `reap:orders`. Scrubs PII on orders whose clock has started and whose claim window has closed, using `orderPiiDaysAfterGuarantee()` and `orderPiiDaysUndelivered()` from config. Returns the number scrubbed.
- `cancelUnpaidOrders(orderIds)` — internal, not exported. Calls `cancelForErasureById` for each order. Never rejects: failures are logged and the rest continue.
- `eraseUserOrders(userId, session)` — the `orders` module's `personalData.erase` hook. Does the following, in order:
  1. Reads the ids of the account's open, never-paid orders.
  2. Runs `detachUserId`.
  3. Runs `clearTimelineActor`.
  4. Returns a deferred cancel of the unpaid orders as an `AfterErase` callback, or `undefined` if there are none.

## Relationships
- `../repository` (`orderRepository`) — does all the persistence: `detachUserId`, `startPiiClock`, `scrubDueForAnonymization` and `findOpenUnpaidIdsOf`.
- `../config` — supplies the retention windows used by `anonymizeDueOrders`.
- `./cancel` — `cancelForErasureById` cancels unpaid orders. It releases the stock hold and, via `ORDER_CANCELED`, cancels the open payment intent.
- `./timeline` — `clearTimelineActor` removes the erased user's name from timeline entries. The rows stay.
- `@kernel/registry` — provides the `AfterErase` type for the deferred callback.
- `@infrastructure/adapters/logger` — logs counts and cancel failures.
- The `reap:orders` job (presumably in `../jobs`) calls `anonymizeDueOrders`. The erase and minimise hooks are presumably wired up through the registry and `services/index`. Neither wiring is visible in this file.
- `tests/integration/erasure.test.ts` is a related test file. The file content doesn't show what it covers.

## Notes
- The cancel is returned rather than run because it affects stock and payment state in other modules, which can't be rolled back. It runs only after the erasure commits.
- The unpaid order ids are read before the detach, because the detach unsets the `userId` used to find them.
- Paid orders are only detached. Never-paid orders are cancelled, and per the `detachUserId` docs their PII is scrubbed at once. This avoids holding stock for a buyer who no longer exists.
- The cancel path deliberately sends no expiry mail, since the address belongs to an erased account. Orders missed by a failed cancel are still cancelled by the reservation sweep when its hold times out.
- The `// Stryker disable` comments only exclude the log calls from mutation testing.
