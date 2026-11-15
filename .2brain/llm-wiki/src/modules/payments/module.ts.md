---
source: src/modules/payments/module.ts
sha256: 9755ffef60dd51427d369843845536ab8133604696f1a95e67e229427a178707
generated_at: 2026-11-14T21:01:25.344667+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.ts

## Purpose

The payments module manifest. Wires the module's routes, background jobs, event subscriptions, public webhook mapping, rate limits, config, and personal-data hooks into a single `AppModule` object consumed by the kernel registry. It is the single registration point the app tier uses to mount everything the payments domain exposes.

## Key elements

- **`publicEvents`** — Maps the seven payment domain events (`PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_REVERSED`, `PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`) to their public webhook payloads. Resolved generically by `webhooks/services/publish.ts` via the registry, never imported by name there.
- **`export default` (AppModule manifest)** — The object the kernel mounts. Key fields:
  - `mounts` — Two route groups: `/payments` (standalone payment routes) and `/orders` (order-scoped payment routes, e.g. `POST /orders/{id}/payments`).
  - `subscribe` — Registers domain-event listeners: cancels open intents + issues refunds on `ORDER_CANCELED`; opens a bank-transfer payment on `ORDER_CREATED`; sends payment/received/refund/refund-failed/refund-reversed emails.
  - `personalData` — `collect` exports a user's payments; `erase` detaches the user ID (payment record survives account deletion).
  - `rawBodyPaths` — `['/webhook']`, relative to the first mount's `basePath`, so the provider's exact-byte signature stays consistent with the composed URL.
  - `config` — `paymentsConfig.slice` (webhook secret, bank-transfer values) and `paymentProviderProbe.slice`.
  - `scenario` — Admin demo: a refunded card payment reached via `GET /orders/{id}/payments`.
- **`paymentsRateLimits`** — Webhook and card-testing budgets.
- **`paymentsJobs`** — Scheduled/recurring jobs for the module.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` and `PublicEventTarget` types this manifest satisfies. The registry is what iterates `publicEvents` and `config` at boot.
- **`src/kernel/events.ts`** — Supplies `onDomainEvent` and `DomainEventMap`; all `subscribe` callbacks use the kernel's event bus.
- **`src/modules/orders/index.ts`** — Source of the `ORDER_CANCELED` and `ORDER_CREATED` events this module reacts to.
- **`src/modules/payments/events.ts`** — Defines the seven payment domain-event constants and their payload types, imported directly (bypassing the module barrel).
- **`src/modules/payments/config.ts`** — Provides `paymentsConfig` (webhook secret, bank-transfer details).
- **Cart integration tests** (`src/modules/cart/tests/integration/backorder.test.ts`, `line-availability.test.ts`, `merge.test.ts`, `preorder.test.ts`, `product-removal-protects-orders.test.ts`, `stock-flag.test.ts`, `stock.test.ts`) — Exercise this module's `ORDER_CANCELED` refund path and `ORDER_CREATED` transfer-payment path end-to-end.
- **Invoicing integration tests** (`src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts`, `issue-credit-note.test.ts`) — Exercise the refund and credit-note flows that depend on payment state.

## Notes

- **Events are imported directly from `./events`, not through the module barrel.** This is a deliberate CLAUDE.md convention to avoid a circular import (the barrel re-exports events, and `subscribe` needs them at module-evaluation time).
- **`meta.eventId` is the outbox row id.** The refund service records it so a redelivered `ORDER_CANCELED` after a staff void cannot issue a second refund.
- **`personalData.erase` detaches, never deletes.** The payment row stays; only the user link is removed, inside the same hard-delete transaction.
- **`rawBodyPaths` is relative to the *first* mount's `basePath` (`/payments`).** The app tier composes the final URL, so the signature path and the mount point can never drift.
