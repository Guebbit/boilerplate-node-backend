---
source: src/modules/payments/module.ts
sha256: ba2fd6cae5061d0e5a534a19fdf15a2a7bfbbd9c3894cc274f40a352f283eb60
generated_at: 2026-11-08T07:22:12.501199+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.ts

## Purpose

The payments module's manifest entry. It declares everything the kernel needs to mount, subscribe, and expose the payments domain: HTTP routes, background jobs, public webhook event mappings, rate-limit budgets, personal-data lifecycle hooks, and domain-event listeners. It exists so the app tier can discover the module generically via the registry rather than importing each piece individually.

## Key elements

- **`publicEvents`** – Maps the seven payment domain events (`PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_REVERSED`, `PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`) to their public webhook payloads. `payment.refunded` additionally surfaces `amount`/`currency` so subscribers skip a payment lookup.
- **`default` export (`AppModule`)** – The module manifest: two route mounts (`/payments`, `/orders`), `paymentsJobs`, `paymentsRateLimits`, `rawBodyPaths: ['/webhook']`, config slices, `personalData` hooks, `subscribe`, `locales`, `templates`, and a `scenario` seed.
- **`subscribe`** – Registers five domain-event listeners:
  - `ORDER_CANCELED` → cancel the open card intent (best-effort) then, if `refund` is present, issue `refundForOrder`.
  - `ORDER_CREATED` → open a bank-transfer payment via `paymentService.openTransferPayment`.
  - `PAYMENT_SUCCEEDED` / `PAYMENT_REFUNDED` → send notification mails.
  - `PAYMENT_REFUND_FAILED` + `PAYMENT_REFUND_REVERSED` → single `mailRefundUndeliverable` listener (one mail, two triggers).

## Relationships

- **`src/kernel/events.ts`** – Imports `onDomainEvent` and `DomainEventMap` for typed event subscription.
- **`src/kernel/registry.ts`** – The manifest satisfies `AppModule`; `publicEvents` is consumed by the registry's `resolvePublicEvents` so the webhook publisher subscribes generically without importing event names.
- **`src/modules/orders/index.ts`** – Imports the `ORDER_CANCELED` and `ORDER_CREATED` domain events; payments is a downstream consumer of order lifecycle.
- **`src/modules/payments/events.ts`** – All payment event constants are imported directly from here (never via the module barrel; see CLAUDE.md module-barrel rule).
- **`src/modules/payments/config.ts`** – Supplies the webhook secret and bank-transfer values via `paymentsConfig.slice`.
- **`src/modules.ts`** – The module barrel this file lives under; events are deliberately reached through `./events` directly, not through this barrel.

## Notes

- **`rawBodyPaths: ['/webhook']`** is relative to the first mount's `basePath` (`/payments`), composed by the app tier so the provider's HMAC signature matches the exact bytes and the two cannot drift.
- **Personal data `erase` detaches, never deletes** – `paymentService.detachUserId` nulls the user reference inside the same hard-delete transaction; the payment row survives account erasure, mirroring the order it paid for.
- **Cancel flow split:** the intent cancellation is best-effort (never rethrown); the refund is the durable half, persisted as an outbox row so a failed delivery is retried by the relay.
- **`scenario.shop` uses the order id**, not the payment id, because the admin screen resolves a payment via `GET /orders/{id}/payments`.
- **Dispute events** (`payment.dispute_opened`, `payment.dispute_updated`) pass their domain payload through verbatim (`{ ...payload }`) — the domain payload is already the public shape (ids, closed codes, money, no free text).
