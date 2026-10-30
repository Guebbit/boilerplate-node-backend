---
source: src/modules/tickets/services/system.ts
sha256: c567ce6e146637c4e36fb87f45eb1990868e563e8b0c2ad2878c9e67e77f54ad
generated_at: 2026-10-29T06:05:49.452794+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/services/system.ts

## Purpose

Translates domain events (payment, user, inventory, order, shipment, account) into system-opened and system-closed tickets. Each producer event maps to a specific `TicketKind`; this service decides whether to open a new ticket, touch an existing one, or clear already-open tickets when a situation resolves. Both directions are idempotent so outbox redelivery is safe.

## Key elements

- **`openSystemTicket(opening, meta)`** – Opens a ticket for the given `SystemOpening`. Idempotent via `eventId` check (`sawEvent`) and a unique `openKey` constraint (duplicate-key catch falls back to `touchOpen`). On a successful insert, records an audit entry and emits `TICKET_OPENED`.
- **`clearMatching(filter)`** – Finds open system tickets matching a filter and performs a conditional status move to `cleared` (read-then-write on `ticket.status`). Audit-logs each successful move.
- **`clearRecord(kinds, link)`** – Convenience wrapper over `clearMatching` that builds an `openKey` `$in` filter from a list of kinds and a link.
- **`systemTickets`** – Exported object of named event handlers (one per subscribed domain event). `module.ts` wires these into the event bus. Each handler delegates to `openSystemTicket` or `clearRecord`/`clearMatching`.
- **`guarded(name, work)`** – Catches handler errors, logs them via the infrastructure logger, then rethrows so the outbox can redeliver.
- **`attentionDueAt(now)`** – Computes a due date using the payments module's own `paymentAttentionMinutes` threshold.
- **`OPEN_DISPUTE`** – Set of dispute statuses (`needs_response`, `under_review`) that still owe the shop a response; other statuses trigger a clear instead.

## Relationships

- **`src/modules/tickets/domain/index.ts`** (re-exports from `domain/system.ts`, `domain/lifecycle.ts`, `domain/routing.ts`) – Provides the `SystemOpening` type, all `*Opening` constructor functions, `openKeyOf`, `routeSetOf`, and `clear`.
- **`src/modules/tickets/audit.ts`** – Supplies `ticketsAuditActions` constants used in `recordAudit` calls.
- **`src/modules/tickets/config.ts`** – Supplies `ticketsConfig()` to read `NODE_TICKETS_FTC_COUNTRIES` for the `onDelayed` handler.
- **`src/modules/payments/index.ts` / `services/index.ts`** – Supplies `paymentService.refundDueAt` (used in `onRefundFailed`) and `paymentAttentionMinutes` (used in `attentionDueAt`).
- **`src/kernel/events.ts`** – Supplies `emitDomainEvent` to publish `TICKET_OPENED`, plus `DomainEventMap`/`DomainEventMeta` types.
- **`src/kernel/access/tenant.ts`** – Supplies `DEPLOYMENT_TENANT_ID` for the event emission context.
- **`src/kernel/permissions.ts`** – Supplies `systemCallerContext` used as the actor in audit records.
- **`src/infrastructure/observability/audit.ts`** – Supplies `recordAudit` for open/clear audit trails.
- **`src/infrastructure/adapters/logger.ts`** – Supplies `logger.error` in the `guarded` wrapper.
- **`src/infrastructure/persistence/mongo-errors.ts`** – Supplies `isDuplicateKey` to detect the race where two events try to open the same ticket simultaneously.

## Notes

- **Two-layer idempotency:** First, `meta.eventId` is checked via `sawEvent`; if already seen, the handler is a no-op. Second, the `openKey` unique index catches concurrent inserts; the catch path degrades to a `touchOpen` (stamp the existing ticket) rather than failing.
- **`onShipped` clears two tickets sequentially** – one keyed by `order` (paid_without_hold) and one keyed by `fulfillment_order` (consent_due). If the first fails, the second never runs; the outbox redelivers the whole event.
- **`onExportReady` uses `clearMatching` with `subjectId`** rather than an `openKey` filter, because export failures are linked to a user rather than a payment/refund record.
- **`onRefundFailed` is conditional:** only opens a ticket when `payload.final` is true; intermediate retry failures are silently ignored.
- **`onDispute` is dual-purpose:** opens a ticket for `OPEN_DISPUTE` statuses, clears one for any other status.
- **`guarded` rethrows after logging** – the design intent is that a failed open is a lost ticket, so the outbox must redeliver rather than swallow the error.
