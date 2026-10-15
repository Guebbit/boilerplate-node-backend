---
source: src/modules/orders/services/retention.ts
sha256: adefa535ae8848060e98106dca5c57fa8c3a7322113dedaf35f118de8df22772
generated_at: 2026-10-15T11:10:25.190946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/retention.ts

## Purpose
Implements the `personalData.erase` and `personalData.minimise` hooks for the orders module under GDPR Art. 17(3)(b)/(e). Because an order is an invoice, it survives account erasure; this file detaches the person from the order, starts a per-order PII clock, and later scrubs residual PII. It also cancels never-paid orders left behind by an erased account so their stock holds are released.

## Key elements
- **`detachUserId(userId, session)`** — Unsets `userId` on all orders for the given account and stamps each with a per-order PII-retention deadline (`createdAt + orderPiiRetentionDays`). Joins the caller's Mongoose session.
- **`startOrderPiiClock(userId)`** — The `personalData.minimise` hook: starts the same PII clock but preserves `userId`. Idempotent (skips orders already stamped).
- **`anonymizeDueOrders()`** — Called by `scripts/ops/reap-orders.ts`; scrubs PII on all orders whose retention window has elapsed. Returns the count scrubbed.
- **`eraseUserOrders(userId, session)`** — The combined `personalData.erase` hook for the orders module. Reads open-unpaid order ids *before* detaching, detaches, clears the timeline actor, and returns a deferred cancel promise (or `undefined`) for the caller to execute **after** the erasure transaction commits.
- **`cancelUnpaidOrders(orderIds)`** *(private)* — Cancels each unpaid order via `cancelById` as `SYSTEM_ACTOR`. Never rejects; individual failures are logged and the rest proceed (the reservation sweep is the safety net).

## Relationships
- **`orderRepository`** (`repository.ts`) — All data access: `detachUserId`, `startPiiClock`, `scrubDueForAnonymization`, `findOpenUnpaidIdsOf`.
- **`orderPiiRetentionDays`** (`config.ts`) — Reads the configurable retention window (default 3650 days / ~10 years).
- **`cancelById`** (`services/cancel.ts`) — Used by `cancelUnpaidOrders` to release stock and cancel payment intents via the normal reservation-sweep path.
- **`clearTimelineActor`** (`services/timeline.ts`) — Called inside `eraseUserOrders` to strip the erased user's name from all order timeline events.
- **`SYSTEM_ACTOR`** (`kernel/permissions.ts`) — Identity passed to `cancelById` so the system, not the deleted user, performs the cancel.
- **`AfterErase`** (`kernel/registry.ts`) — Type for the deferred post-commit callback returned by `eraseUserOrders`.
- **`logger`** (`infrastructure/adapters/logger.ts`) — Structured logging on detach, clock-start, anonymize, and cancel-failure events.
- **`services/index.ts`** — Barrel re-export so the module wiring can import the four public functions.
- **`module.ts`** — Registers `eraseUserOrders` as the module's `personalData.erase` hook and `startOrderPiiClock` as the `personalData.minimise` hook.

## Notes
- **Per-order clock, not a global one.** `detachUserId` stamps each order's deadline from *that order's* `createdAt`, not from the moment of erasure. A never-paid order is scrubbed at once (it never became an invoice).
- **`eraseUserOrders` returns a promise, it does not execute the cancel.** The cancel moves stock and money-adjacent state in other modules that cannot roll back, so the caller must await the returned promise *after* the hard-delete transaction has committed.
- **Order-id lookup precedes the detach.** `findOpenUnpaidIdsOf` runs before `detachUserId` unsets `userId`; once detached, those orders are unfindable by user.
- **`cancelUnpaidOrders` is fire-and-forget per order.** A single failure (payment racing in, write conflict) does not abort the batch; the reservation sweep (up to 168 h for bank transfer) cancels anything missed.
- **Stryker mutation-testing suppressions** are placed inline on every logger call and the catch block — do not remove them when editing.
