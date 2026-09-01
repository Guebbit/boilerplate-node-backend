# src/modules/payments/analytics.ts

## Purpose

Declares the analytics event names emitted by the payments module and registers them in the shared analytics port's type map. Controllers import this file directly (rather than a published copy) to get typed event names, following the same augmentation pattern as `./audit.ts`.

## Key elements

- **`paymentsAnalyticsEvents`** (exported const) — The two analytics events the module emits: `PAYMENT_SUCCEEDED` (`"payment_succeeded"`) and `PAYMENT_DECLINED` (`"payment_declined"`). Together they form the funnel's last gate; `succeeded / (succeeded + declined)` is the conversion metric that changes when a payment provider is swapped.
- **`declare module '@infrastructure/observability/analytics'`** — Augments the `AnalyticsEventMap` interface with a `payments` key typed to the union of the event values, so downstream consumers get autocomplete and type safety without a separate re-export.

## Relationships

- **`src/modules/payments/service.ts`** — The payment service that presumably fires these two events (`PAYMENT_SUCCEEDED`, `PAYMENT_DECLINED`) as part of its transaction flow. It imports this file to reference the typed event names when emitting analytics calls.

## Notes

- Naming for the event strings must follow the convention in `docs/tools/analytics.md#naming`; do not rename casually.
- The `as const` on the export is load-bearing: it's what lets the `declare module` augmentation derive a precise string-literal union instead of `string`.
- The module comment explicitly states that controllers import *this file* (not a published/re-exported copy), so adding a re-export elsewhere can create a source of truth mismatch.
