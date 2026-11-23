---
source: src/modules/orders/events.ts
source_sha256: 9c9e9e38e1fc159ae3ec503d3f8c07838c79c57e61ce92db2f172cf12fe69bd9
context_sha256: c7e3bfefa974cf1f793164d577d192bd277880cefb6d7072c4966ed03536fb07
generated_at: 2026-11-22T06:14:35.798878+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/events.ts

## Purpose
Declares the domain event name constants that the `orders` module emits. The events themselves are specified in `./asyncapi.domain-events.yaml`. Because `orders` sits low in the dependency graph (payments and delivery depend on it, not the reverse), announcing events is the only way it can notify those modules.

## Key elements
Each export is a string literal constrained with `satisfies DomainEventName`:
- `ORDER_CANCELED` = `'order.canceled'`
- `ORDER_STATUS_CHANGED` = `'order.status_changed'`
- `ORDER_CREATED` = `'order.created'`
- `ORDER_STATUS_OVERRIDDEN` = `'order.status_overridden'`
- `ORDER_BILLING_CORRECTED` = `'order.billing_corrected'`
- `ORDER_REDACTED` = `'order.redacted'`
- `ORDER_PURCHASE_HOLD_PLACED` = `'order.purchase_hold_placed'`

## Relationships
- Imports the `DomainEventName` type from `src/kernel/events.ts`. Each constant must be a valid member of that type.
- The neighbor files (services, repository, module, index and the integration tests) are the likely emitters and listeners of these names. The constants exist so that both sides share one spelling instead of duplicated literals. The file content does not show which neighbor uses which constant.

## Notes
- Adding an event means adding a constant here, a matching channel in `asyncapi.domain-events.yaml`, and an entry in the kernel's `DomainEventName`. The `satisfies` check fails to compile if the kernel type doesn't include the name.
- `satisfies` keeps each constant's literal type, so it isn't widened to `string`.
