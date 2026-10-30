---
source: src/modules/delivery/services/notify.ts
sha256: f9bc3c66bc2f4663db9a4169d6c767d50996ee3c2f64a56c448a493493a9dcef
generated_at: 2026-10-29T03:41:29.002378+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/notify.ts

## Purpose

Email notification dispatchers for the delivery module. Each exported function maps a domain event (shipment shipped/delivered/lost, fulfillment delayed, hold noticed, tracking changed) to a buyer-facing email, composed from templates in `../emails` and queued via the mailer adapter. All functions are best-effort: a mail failure is logged and swallowed so it can never roll back the underlying act.

## Key elements

- **`emailLines(shipment)`** — internal helper; extracts `{ title, quantity }` from each line of a `ShipmentDocument`.
- **`mailShipped(payload)`** — on `shipment.shipped`: loads the shipment, then emails the buyer the carrier, tracking code, and line items. Skips entirely if `remainingUnits` is `undefined` (digital fulfilment).
- **`mailTrackingChanged(shipment, variant)`** — re-sends the shipped-style email when a tracking code is added or corrected. `variant` is a `TrackingVariant` (`"added" | "corrected"`) that changes subject/tone.
- **`mailDelivered(payload)`** — on `shipment.delivered`: emails the buyer the arrival. If the order's status is now `OrderStatus.delivered`, also includes the `withdrawUntil` deadline (read fresh post-commit).
- **`mailLost(lost)`** — on `shipment.lost`: emails reason, line items, still-owed units, optional `expectedAt`, staff message, and an order link. No opt-out switch.
- **`mailDelayed(delayed)`** — on `fulfillment_order.delayed`: emails the agreed/expected dates, titles, and reason. No action required from the buyer.
- **`mailHoldNoticed(held)`** — on `fulfillment_order.hold_noticed`: emails the hold notice and any staff message, with an order link.

## Relationships

- **`@infrastructure/adapters/mailer`** — every notification function calls `enqueueEmail` to queue the outbound message.
- **`@infrastructure/adapters/logger`** — all error/warn paths and the shipped-confirmation log line go through `logger`.
- **`@modules/orders` (`orderService`)** — `mailBuyerOfOrder` resolves the buyer's email, locale, and display name before the callback composes the mail; `orderFrontendLink` builds the order-page URL embedded in lost/delayed/hold mails.
- **`@modules/delivery/emails`** — provides the template-builder functions (`shipmentShippedEmail`, `shipmentDeliveredEmail`, `shipmentLostEmail`, `fulfillmentDelayedEmail`, `holdNoticeEmail`) and the `TrackingVariant` type.
- **`@modules/delivery/repository`** — `shipmentRepository.findById` fetches the full `ShipmentDocument` needed for line items and tracking code.
- **`@modules/delivery/events`** — source of `FulfillmentOrderDelayed` and `FulfillmentOrderHoldNoticed` payload types.
- **`@modules/delivery/model`** — `ShipmentDocument` type used by `emailLines` and the shipped/delivered/lost handlers.
- **`@kernel/events`** — `DomainEventMap` types the `shipment.shipped`, `shipment.delivered`, and `shipment.lost` payloads.
- **`@types`** — `OrderStatus.delivered` check in `mailDelivered` to decide whether to include `withdrawUntil`.
- **`services/tracking.ts`** — sibling service that saves tracking-code changes and then calls `mailTrackingChanged`.
- **`tests/unit/fulfillment.test.ts` / `tests/unit/lost.test.ts`** — unit tests covering `mailDelayed`, `mailHoldNoticed`, and `mailLost`.

## Notes

- **Fire-and-forget by design.** Every `.catch` block only logs; no error is re-thrown. `enqueueEmail` itself never rejects, so the `void` floating-promise ESLint suppressions are safe.
- **Digital fulfilment short-circuit.** `mailShipped` returns early when `remainingUnits` is `undefined`; the arrival mail (`mailDelivered`) is the only notification the buyer receives for digital items.
- **Post-commit read in `mailDelivered`.** `withdrawUntil` is read from the order *after* the delivery transaction has committed, so it reflects the freshly written deadline rather than a stale value.
- **Stryker mutation-test guards.** `// Stryker disable all` / `// Stryker restore all` pairs wrap the error-logging branches so Stryker does not flag those intentional catch blocks as killed mutants.
- **No idempotency key is visible here.** Deduplication (if any) is expected to live in the mailer adapter or event-bus layer, not in this file.
