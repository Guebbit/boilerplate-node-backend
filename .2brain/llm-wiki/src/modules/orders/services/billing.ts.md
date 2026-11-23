---
source: src/modules/orders/services/billing.ts
source_sha256: 433c401f8c87fe720e95b6e26696e887c83e7288b21ff5e0b0f05e8d847d2c24
context_sha256: ef10c562f2eb6690b8edb811d4db9f89539c878bbf6aa420a18c3b2d0fa172d6
generated_at: 2026-11-22T06:18:49.526983+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/billing.ts

## Purpose
Service behind staff correcting who an order is invoiced to (`PUT /orders/{id}/billing-address`): name, address or VAT number. It is the twin of `./address.ts`, except the write may follow an already-issued invoice. `orders` never touches the invoice; it announces `order.billing_corrected` in the write's own transaction, and `invoicing` cancels and reissues the invoice off that event.

## Key elements
- `correctBillingAddress(orderId, address, context)` — the only export. Returns `ResponseSuccess<OrderDocument>` or a `ResponseReject`:
  - 404 if the order is unknown (scoped lookup via `orderRepository.findByIdScoped`).
  - 409 (`ORDER_BILLING_LOCKED`) if `canCorrectBilling` is false, or if the order was anonymised between the read and the write.
  - 200 with the unchanged order, and no write, event or audit, if the address equals the current one (`isSameBillingAddress`), so the call is idempotent.
  - Otherwise replaces the billing address whole, adds a `billing_corrected` timeline row (actor = `context.caller.id`), announces the event, records an audit entry, and returns the updated order.
- `locked()` — private helper building the 409 reject with `t('orders.billing.locked')`.

## Relationships
- `../repository` (`orderRepository`): `findByIdScoped` for the read, `replaceBillingAddress(orderId, address, session)` for the write.
- `./timeline` (`withTimeline`): wraps the repository write so the timeline row is written in the same session.
- `@kernel/outbox` (`announceInTransaction`) with `./announce` (`billingCorrectedEvent`): publishes the event atomically with the write.
- `./read` (`billingAddressOf`): extracts the order's current billing address for the comparison.
- `../domain` (`canCorrectBilling`, `isSameBillingAddress`): business rules for locking and idempotency.
- `@infrastructure/observability/audit` (`recordAudit`) with `../audit` (`ordersAuditActions`): audit record after success.
- `@infrastructure/http/response` (`generateSuccess`, `generateReject`) and `@infrastructure/i18n` (`t`): response and message building.
- `../model` (`OrderDocument`) and `@types` (`CallerContext`, `OrderBillingAddress`): types.

## Notes
- Allowed at any status. An order not yet invoiced simply carries the corrected address into its future invoice.
- The address stays encrypted under the order's id. The audit row and timeline name who made the change, never what the address says.
- The caller is assumed to hold `update:Order`; the route enforces this, not this service.
- Audit is recorded only on the success path, after the transaction has committed.
