---
source: src/modules/orders/services/cancel.ts
sha256: f1af396ae55d4e4c48c048a975fda6b816674721cd52cdce96fe88eb411c797f
generated_at: 2026-11-14T20:42:32.172770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel.ts

## Purpose

Executes an order cancellation as a single atomic transaction: the conditional status move to `canceled`, the release (or committed-release) of the order's stock claim, and the `order.canceled` outbox row all commit or roll back together. The refund is deliberately excluded from the transaction (it is an external-provider action that cannot roll back); instead it is carried as a `refund` flag on the outbox event, which the `payments` module consumes to open its own refund record.

## Key elements

- **`CancelCause`** (exported type) — discriminated union of every reason an order can be canceled (`customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch`, `lost`).
- **`CANCEL_CAUSES`** (exported const) — single lookup table mapping each cause to its rules: which lifecycle actor performs the move, which mail template fires, which analytics event is emitted, and whether the refund is caller-decidable (`refundIsChoice`).
- **`afterCancel`** (exported) — post-commit side effects: records the audit row, emits the analytics event, and returns the HTTP success response. Does **not** trigger the refund or the customer mail (those ride the outbox event).
- **`moveToCanceled`** (internal) — the core atomic write. Runs `orderRepository.updateStatusIfIn` + `giveBackStock` inside one Mongoose session, then announces `ORDER_CANCELED` via the outbox. Accepts an optional `within` session to join a caller-owned transaction. Refreshes the inventory stock cache only after commit.
- **`giveBackStock`** (internal) — releases a `held` reservation, or (for paid orders) releases a `committed` hold without restocking. Both calls are conditional on the hold's state, so calling them speculatively is safe.
- **`attemptCancel`** (internal) — builds the write scope from the caller's permissions and the cause's lifecycle column, resolves the refund decision, and delegates to `moveToCanceled`. Returns a `CancelAttempt` (order or `null`).
- **`CancelAttempt`** (internal interface) — the pre-reporting result: the order (or `null` if the conditional match failed) plus the `refund` flag and scope for downstream reporting.

## Relationships

- **`@kernel/outbox`** — `announceInTransaction` / `announceWithin` wrap the write so the `ORDER_CANCELED` row commits atomically with the status and stock changes.
- **`@modules/inventory`** (`inventoryService`) — `releaseForOrder`, `releaseCommittedForOrder`, and `refreshStockCacheForOrder` are the stock-side half of the cancel.
- **`@kernel/permissions`** — `SYSTEM_ACTOR` and `systemCallerContext` supply the caller identity for system-initiated causes.
- **`@modules/access`** — `ownOrderFlag` is included in the audit metadata to mark whether the caller acted on their own order.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit row in `afterCancel`.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` fire the analytics event.
- **`../analytics` / `../audit`** — `ordersAnalyticsEvents` and `ordersAuditActions` provide the specific event and action identifiers.
- **`../domain`** — `buyerIdOf` (for audit metadata), `statusesLeadingTo` (to build the `from` list for the conditional update), `OrderActor` type.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build the HTTP envelope.
- **`@infrastructure/i18n`** — `t` for any user-facing strings.
- **`./read`**, **`./timeline`**, **`./scope`** — sibling service helpers (`getById`, `withTimeline`, `cancelScope`, `actorOf`) used inside the write path.

## Notes

- The refund is **not** performed here. The `refund: boolean` flag on the outbox payload is the only record; the `payments` module acts on it via the outbox relay (retries until the refund record exists).
- `giveBackStock` distinguishes `held` vs `committed` holds: a paid order's hold is *committed* (units reserved at purchase), so releasing it does **not** restock — units leave the shelf at shipment, not at cancellation.
- The `within` parameter allows a caller (e.g., the withdrawal/returns flow) to fold the cancel into its own transaction; the caller then commits, nudges the relay, and refreshes the stock cache.
- The conditional write (`updateStatusIfIn`) embeds both the caller's scope and the `from` status list in a single filter, so a racing `shipped` transition or a double-click resolves at the storage layer — at most one write matches.
- The `lost` cause is written by `markUndeliverable` (the remainder-cancel path), **not** by the public `cancel()` entry point; it carries `refund: false` because the prior cancel already refunded.
- The stock-cache refresh (`refreshStockCacheForOrder`) runs **after** commit because that cache write is not transactional and cannot roll back.
