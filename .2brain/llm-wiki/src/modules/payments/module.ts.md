---
source: src/modules/payments/module.ts
sha256: dc6a977c33170e2b4c2f2b6cdb767ae65ddfd73d277b63f4390858c492acba8c
generated_at: 2026-09-23T19:18:48.112670+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.ts

## Purpose

The manifest entry point for the payments module. It assembles the module's `AppModule` contract — routes, permissions, event subscriptions, config validation, rate limits, personal-data export, and the demo scenario — so the app tier can mount and boot the module as a unit.

## Key elements

- **`toExportPayment`** — Maps a Mongoose payment document to a plain `ExportPayment` object, deliberately dropping `userId` (already scoped by the caller's query) and conditionally including `cardLast4`, `createdAt`, `updatedAt`.
- **`export default` (the `AppModule` object)** — The single object the registry consumes:
    - `permissions` — four keys (`payments.self.read`, `payments.any.read`, `payments.any.create`, `payments.any.update`) that are created and torn down with the module.
    - `routes` — the Hono/Express router from `./routes`.
    - `rawBodyPaths: ['/webhook']` — lets the provider verify a signature over exact request bytes.
    - `requiredConfig` — declares `NODE_PAYMENT_WEBHOOK_SECRET` (min 16 chars, `productionOnly`).
    - `customCheck` — validates bank-transfer IBAN/BIC via `validateBankTransferConfig` and resolves the payment provider name via `checkSelector('NODE_PAYMENT_PROVIDER', resolvePaymentProvider)` so an unknown name throws at boot, not on first payment.
    - `subscribe` — registers two domain-event listeners: `ORDER_CANCELLED` → `refundForOrder`, and `USER_DELETED` → `detachUserId`.
    - `personalData` — collects a user's own payments for GDPR/erasure export.
    - `scenario` — names a demo path (`shop: ['payment.refunded']`) keyed by **order** id, since `GET /payments/order/{orderId}` is the only read route.
- **`import './events'`** — Side-effect import that installs the `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` event declarations into the kernel.

## Relationships

| Neighbor                                  | Interaction                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/kernel/registry.ts`                  | Imports the `AppModule` type that the default export `satisfies`.                                                   |
| `src/kernel/events.ts`                    | Imports `onDomainEvent` to register the `ORDER_CANCELLED` and `USER_DELETED` handlers.                              |
| `src/kernel/required-config.ts`           | Imports `checkSelector` to turn `resolvePaymentProvider` into a boot-time assertion.                                |
| `src/modules/orders/index.ts`             | Imports the `ORDER_CANCELLED` event constant.                                                                       |
| `src/modules/orders/module.ts`            | Conceptual dependency: a payment freezes an order's total; refunds are triggered by order cancellation.             |
| `src/modules/payments/routes.ts`          | Supplies the `router` mounted at `basePath: '/payments'`.                                                           |
| `src/modules/payments/services/index.ts`  | Provides `refundForOrder`, `detachUserId`, `findOwnPayments` used by subscriptions and the personal-data collector. |
| `src/modules/payments/config.ts`          | Provides `validateBankTransferConfig` for the custom boot check.                                                    |
| `src/modules/payments/providers/index.ts` | Provides `resolvePaymentProvider` so an unknown provider name fails at boot.                                        |
| `src/modules/payments/rate-limits.ts`     | Provides `paymentsRateLimits` (webhook and card-testing budgets).                                                   |
| `src/modules/payments/events.ts`          | Side-effect import; declares `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED`.                                                |
| `src/modules.ts`                          | Aggregates this module for registration in the app.                                                                 |

## Notes

- **`userId` omission is intentional.** `applyPaymentTransform` (Mongoose) does not strip it, so returning the raw document would still serialize `userId`. `toExportPayment` builds a fresh object to guarantee its absence.
- **`rawBodyPaths` is relative to `basePath`.** The app tier composes the final mount point, so the webhook path is stated once and cannot drift from the signature the provider expects.
- **`productionOnly` on the webhook secret.** `tests/support/setup.ts` injects a dev value and the `fake` provider needs none, so a missing secret in dev is not a real failure.
- **`customCheck` exists because `requiredConfig` is declarative.** Cross-field rules (IBAN without BIC) and library-dependent validation (`ibantools`) cannot be expressed in the declarative schema.
- **Detach, never delete.** `USER_DELETED` calls `detachUserId`, not a delete — the payment record survives account erasure, mirroring the order it settled.
- **The `scenario` key references the order id**, not the payment id, because `GET /payments/order/{orderId}` is the only read path exposed to callers.
