---
source: src/modules/returns/services/refund-due.ts
sha256: e55a8ede9a59c02b3db8dcabb7a19ed52ba85bf77647119d540e1d36785d675d
generated_at: 2026-11-14T21:41:12.286996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/refund-due.ts

## Purpose

Computes the refund deadline to stamp on a return at the moment it opens. It is a thin service wrapper around the pure domain rule table (`refundDueByOf`) that injects the one piece of context a domain file cannot reach: the shop's timezone, needed to calculate withdrawal deadlines on the shop's calendar.

## Key elements

- **`refundDueFor(returned, arrived)`** — The sole export. Accepts the return's `reason` and `requestedAt`, plus arrival metadata (`receivedAt`, `proofOfSendingAt`). Returns a `ReturnRefundDue` stamp or `undefined` if the law sets no deadline for that reason. Internally delegates all rule selection to `refundDueByOf`; only handles the withdrawal-specific calculation itself.

## Relationships

- **`src/modules/returns/domain/refund-due.ts`** (via `../domain`) — Source of `refundDueByOf` (the pure rule table) and the `ReturnRefundDue` return type. This file does no rule logic itself.
- **`src/modules/returns/domain/index.ts`** — Re-exports the above; the actual import target.
- **`src/modules/returns/model.ts`** — Provides the `ReturnDocument` type, from which this file picks `reason` and `requestedAt`.
- **`src/modules/orders/index.ts`** → **`src/modules/orders/domain/withdrawal.ts`** — Source of `withdrawalRefundDueBy`, called only when `reason === 'withdrawal'` to compute the deadline from the shop's requested-at date and timezone.
- **`src/modules/shop/index.ts`** → **`src/modules/shop/service.ts`** — Source of `shopTimezone()`, the timezone string passed to the withdrawal calculation.

## Notes

- The reason this exists as a *service* (rather than living in the domain) is solely the `shopTimezone()` dependency. The module docblock states this explicitly.
- `withdrawalDueBy` is only populated for the `'withdrawal'` reason; for every other reason it is `undefined` and the deadline (if any) derives entirely from the `arrived` fields.
- The timezone choice is legally grounded: EU Regulation 1182/71 Art. 2(1) requires deadlines to be counted on the actor's (the shop's) calendar.
