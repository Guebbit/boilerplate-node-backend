# src/modules/payments/analytics.ts

## Purpose

Declares the analytics event names owned by the payments module and augments the infrastructure analytics port's type map so the names are available to the whole project without the infrastructure layer knowing about payments. This file contains no logic—only a name registry and a `declare module` type extension.

## Key elements

- **`paymentsAnalyticsEvents`** (`as const`) — the two event names this module emits: `PAYMENT_SUCCEEDED` (`'payment_succeeded'`) and `PAYMENT_DECLINED` (`'payment_declined'`). Together they form the funnel's last gate; their ratio is the conversion metric a payment-provider change would move.
- **`declare module '@infrastructure/observability/analytics'`** — adds a `payments` key to `AnalyticsEventMap`, typed as the union of the values above. Follows the same augmentation pattern as `./audit.ts`, keeping the catalogue distributed and the infrastructure layer domain-agnostic.

## Relationships

- **`src/modules/payments/service.ts`** — the service/controller layer that fires these events imports `paymentsAnalyticsEvents` directly to emit `payment_succeeded` / `payment_declined` at the appropriate points in the payment flow.
- **`scripts/contracts/analytics-events-bundle.ts`** — collects or validates event names across modules (e.g., for contract checks or documentation generation); this file is one of the sources it draws from.

## Notes

- **Boundary split:** These names are backend-only and are never published to the frontend. The paired frontend events live in `shared/contracts/analytics.frontend.ts` (events the service *never* observes). Keeping them in separate files is what prevents a single event from being double-counted.
- **Naming rule:** Event name strings must conform to the convention documented at `docs/tools/analytics.md#naming`.
- **No central registry:** New events are added here (or in sibling modules like `./audit.ts`) rather than in a shared file; `infrastructure` stays free of domain knowledge.
