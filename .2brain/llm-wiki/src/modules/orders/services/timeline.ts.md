---
source: src/modules/orders/services/timeline.ts
sha256: 91b300b0bd15d18e8e790c9fe879865cbf98fff23245b85018fba435edea898d
generated_at: 2026-10-15T11:12:09.259520+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/timeline.ts

## Purpose

Central write-and-read path for an order's event timeline. It provides the single door through which the `orders` module and any module that depends on it (payments, delivery, returns, invoicing) record what happened to an order, always inside the caller's transaction so the row commits atomically with the fact it describes. It also handles role-filtered reads, data-export collection, and data-hygiene operations (actor erasure, text retention scrubbing, hard-delete cleanup).

## Key elements

- **`appendTimeline(orderId, entry, session)`** — Inserts one timeline row via `orderEventRepository.create` in the caller's Mongoose session. Normalises optional `actor`/`text` fields and defaults `at` to now.
- **`appendTimelineAll(orderId, entries, session)`** — Sequentially appends multiple rows (oldest first) in the same session; serial because a transaction session cannot run parallel ops.
- **`withTimeline(write, rows)`** — Higher-order helper returning a session-scoped function. Runs a conditional order write; if a document is returned, appends the rows built from that document. A lost race (null result) writes neither the order change nor the rows.
- **`readTimeline(orderId, authContext)`** — Fetches events for one order and passes them through `presentTimeline` as `'staff'` or `'buyer'` view. Staff view is determined by the `orders.any.read` held key (not a CASL action).
- **`collectTimelineOf(userId)`** — Gathers every timeline row across a user's own orders (full staff-presentation, including actor and free text) for the account-data-export endpoint.
- **`clearTimelineActor(userId, session)`** — Nulls the actor reference on all rows written by an erased account; the rows themselves remain.
- **`scrubTimelineText()`** — Unsets free-text on rows older than `orderEventTextRetentionDays`; logs the count when non-zero. Intended for the `scripts/ops/reap-orders.ts` sweep.
- **`deleteTimelineOf(orderId)`** — Deletes all timeline rows belonging to a hard-deleted order.
- **`readsEveryOrder(authContext)`** *(private)* — Returns true when the caller holds the `orders.any.read` key, gating the staff vs. buyer read view.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Logs the retention-scrub count in `scrubTimelineText`.
- **`src/infrastructure/persistence/create-repository.ts`** — Uses `toObjectId` to convert the string `orderId` for the repository call.
- **`src/kernel/ability.ts`** — Uses `heldKeys` to inspect the caller's held permission keys for the staff-read check.
- **`src/kernel/permissions.ts`** — Uses `callerForSubject` to build the CASL subject from the auth context.
- **`src/modules/orders/config.ts`** — Reads `orderEventTextRetentionDays` for the text-retention window.
- **`src/modules/orders/domain/index.ts`** — Consumes the `TimelineEntryInput` type for all write functions.
- **`src/modules/orders/model.ts`** — Consumes the `OrderDocument` type in `withTimeline`'s write signature.
- **`src/modules/orders/presenter.ts`** — Delegates all read/collect presentation to `presentTimeline` and `presentTimelineEntry`.
- **`src/modules/orders/repository.ts`** — All persistence goes through `orderEventRepository` (create, findByOrderId, findByOrderIds, clearActor, scrubTextBefore, deleteByOrderId).
- **`src/modules/orders/services/cancel.ts`, `fulfillment.ts`, `override.ts`** — Sibling services in the same module; expected callers of `appendTimeline` / `withTimeline` within their own transactions.
- **`src/modules/orders/services/index.ts`** — Barrel file that re-exports this module's public functions for the rest of the codebase.
- **`src/modules/orders/module.ts`** — Module wiring; registers the service for the orders module's dependency graph.

## Notes

- **Two writers, one door:** `orders` appends inside its own transaction; external modules (payments, delivery, etc.) call `appendTimeline` inside *their* transaction. `orders` cannot subscribe to their events because they import it, making a listener a circular dependency.
- **`withTimeline` is the preferred pattern** for conditional writes that should also record a timeline entry — it guarantees the rows only land when the write succeeds.
- **Permission check uses held keys, not CASL actions.** `orders.self.read` and `orders.any.read` share a CASL action, so a CASL `can()` check would incorrectly grant the staff view to every buyer. The held-key check via `heldKeys` is the correct discriminator.
- **`appendTimelineAll` is intentionally sequential.** Mongoose transaction sessions do not support parallel operations, and timeline ordering must be preserved.
- **Text retention is separate from row retention.** `scrubTimelineText` removes only the free-text field; the row, its `type`, and its `data` codes persist indefinitely.
