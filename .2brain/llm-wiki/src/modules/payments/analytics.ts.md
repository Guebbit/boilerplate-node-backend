---
source: src/modules/payments/analytics.ts
generated_at: 2026-11-22T06:39:34.461814+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/analytics.ts

## Purpose
Declares the analytics event names emitted by the payments module and registers them with the analytics port's type map. Controllers import this file directly, so event names are type-checked and a typo fails to compile. It follows the same pattern as `./audit.ts` does for audit actions.

## Key elements
- `paymentsAnalyticsEvents`: a `const` object of event-name strings:
  - `PAYMENT_SUCCEEDED` → `'payment_succeeded'`
  - `PAYMENT_DECLINED` → `'payment_declined'`
  - `PAYMENT_RECORDED_OFFLINE` → `'payment_recorded_offline'`
- Module augmentation of `@infrastructure/observability/analytics`: adds a `payments` key to `AnalyticsEventMap`. Its type is the union of the values of `paymentsAnalyticsEvents`.

## Relationships
The listed neighbors (`src/modules/payments/services/offline.ts`, `src/modules/payments/services/settlement.ts`, `src/modules/payments/tests/integration/settlement-reports.test.ts`) are not referenced in this file. The only dependency it declares is the augmented `@infrastructure/observability/analytics` module. Presumably the neighbors use these event names, but that isn't visible here.

## Notes
- `PAYMENT_SUCCEEDED` and `PAYMENT_DECLINED` are the funnel's last gate. Succeeded over (succeeded + declined) is the card conversion number that a payment provider change would move.
- `PAYMENT_RECORDED_OFFLINE` is deliberately a separate event, not a flagged `PAYMENT_SUCCEEDED`. Offline payments never went through the provider funnel, and merging them would inflate the conversion number.
- The file's header comment points to a naming-conventions doc (`docs/understand/analytics.md#naming`), which is not a file in this repository.
