---
source: src/modules/payments/module.ts
source_sha256: 569ce4aad1a5c0e5a57977a67a6fe39706ebab79ac68aeea181eb3fb5dca687a
context_sha256: 2f6daf9c3344d22e5576e090a2b3193b4afd0e5f0f7b4a2fe8e8090b741fced5
generated_at: 2026-11-22T06:46:22.647021+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/module.ts

## Purpose
Manifest entry for the `payments` module. It declares how payments plugs into the app: HTTP mounts, background jobs, public (webhook) events, rate limits, config slices, personal-data hooks, domain-event subscriptions, locales/templates and a demo scenario. Payments sits behind a provider port (`./providers`) and depends on orders: a payment freezes an order's total, and a refunding `ORDER_CANCELED` opens the refund.

## Key elements
- **Default export** (`satisfies AppModule`) — the module manifest:
  - `name: 'payments'`.
  - `mounts`: `router` at `/payments`, and `orderRouter` at `/orders` (serves `POST /orders/{id}/payments`).
  - `jobs`: `paymentsJobs`.
  - `rateLimits`: `paymentsRateLimits` (webhook and card-testing budgets).
  - `rawBodyPaths: ['/webhook']` — the provider signs the exact bytes it sends. The path is relative to the first mount's `basePath`.
  - `config`: `paymentsConfig.slice` and `paymentProviderProbe.slice`.
  - `personalData`: one `payments` section. `collect` calls `paymentService.findOwnPaymentsForExport`. `erase` calls `paymentService.detachUserId`, which detaches the user and does not delete the payment, inside the hard-delete transaction.
  - `subscribe()`: registers the domain-event listeners (see Relationships).
  - `locales` and `templates`: the `locales` and `templates` directories next to this file.
  - `scenario: { shop: ['payment.refunded'] }` — a seeded refunded payment for the admin screen. The row's id is the order's id.
- **`publicEvents`** (module-local const) — maps domain events to webhook-visible events:
  - `PAYMENT_SUCCEEDED` → `payment.succeeded`
  - `PAYMENT_FAILED` → `payment.failed`
  - `PAYMENT_REFUNDED` → `payment.refunded` (adds `amount`/`currency`)
  - `PAYMENT_REFUND_FAILED` → `payment.refund_failed` (adds `failureReason`/`final`)
  - `PAYMENT_REFUND_REVERSED` → `payment.refund_reversed`
  - `PAYMENT_DISPUTE_OPENED` → `payment.dispute_opened`
  - `PAYMENT_DISPUTE_UPDATED` → `payment.dispute_updated`

  The dispute events pass the whole domain payload through (`{ ...payload }`).

## Relationships
- **`@kernel/registry`**: provides the `AppModule` and `PublicEventTarget` types. The webhooks publisher reads `publicEvents` generically through `resolvePublicEvents`, so it does not import the payment event constants by name. `src/modules.ts` presumably assembles this manifest, but that is not visible in this file.
- **`@kernel/events`**: `onDomainEvent` and `DomainEventMap` are used to subscribe and to type the payloads.
- **`@modules/orders`** (`src/modules/orders/index.ts`): supplies `ORDER_CANCELED` and `ORDER_CREATED`, which this module subscribes to.
  - `ORDER_CANCELED` closes any open card intent, then issues a refund when the event's `refund` is set.
  - `ORDER_CREATED` opens a bank-transfer payment for the order.
- **`./config`**: `paymentsConfig` supplies the config slice.
- **`./providers`, `./jobs`, `./rate-limits`, `./routes`, `./order-routes`, `./services`, `./events`**: sibling files that this manifest wires together.
- **Other modules' tests** (cart and invoicing integration tests) and **`src/modules/invoicing/module.ts`** are listed as graph neighbors. This file shows no direct interaction with them.

## Notes
- `./events` is imported directly and not through the module's own barrel, per CLAUDE.md "Module barrels".
- The `ORDER_CANCELED` handler returns a promise, and a rejection makes the outbox relay redeliver. Closing the open card intent is best-effort and never rethrown. The refund is the durable half. `meta.eventId` is the stable outbox row id, so a redelivery after staff voided the refund cannot pay again.
- `PAYMENT_REFUND_FAILED` and `PAYMENT_REFUND_REVERSED` share the `mailRefundUndeliverable` listener. The listener reads the record, so a refusal that is not the card's mails nobody.
- The dispute payloads are described as already public: ids, closed codes and money, no free text.
- A payment survives account erasure, the same as the order it paid for.
