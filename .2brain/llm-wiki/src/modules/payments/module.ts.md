---
source: src/modules/payments/module.ts
sha256: c36365cfcb7da26dc0ee55e271d2da671fcf90cfecc0dc6b9beeec87ad1930e1
generated_at: 2026-09-27T15:23:53.169458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.ts

## Purpose

The Payments module's registration manifest. It assembles routes, event subscriptions, permission keys, config validation, personal-data hooks, and public-webhook event mappings into a single `AppModule` object consumed by the kernel registry at boot. It exists so the rest of the codebase can discover and wire the module without importing its internals.

## Key elements

- **`publicEvents`** – Maps the two domain events (`PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`) to their public webhook payloads (`payment.succeeded` / `payment.failed`). The kernel's `resolvePublicEvents` in `registry.ts` dispatches to these instead of importing the event names by hand.
- **`export default` (the `AppModule`)** – The full manifest: `name`, `basePath` (`/payments`), `permissions` (four keys), `routes`, `publicEvents`, `rateLimits`, `rawBodyPaths`, `requiredConfig`, `customCheck`, `personalData`, `subscribe`, `locales`, `scenario`.
- **`subscribe`** – Registers two domain-event listeners: `ORDER_REFUND_OWED` → `refundForOrder(orderId)` and `ORDER_CANCELLED` → `cancelOpenIntentForOrder(orderId)` (best-effort; failures are logged, not rethrown).
- **`personalData`** – Provides `collect` (via `findOwnPaymentsForExport`) and `erase` (via `detachUserId`) hooks. Erasure nullifies the payer link in the same hard-delete transaction; the payment row itself is never deleted.
- **`customCheck`** – Boot-time validation beyond simple presence/length: bank-transfer IBAN/BIC + beneficiary cross-field rules, provider-name resolution, and Stripe key sanity.
- **`scenario`** – Declares the `payment.refunded` demo scenario, keyed by the **order** id (the only read path a payment exposes).

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `AppModule` and `PublicEventTarget` types this file satisfies; the exported object is the unit the registry enumerates.
- **`src/kernel/events.ts`** – `onDomainEvent` and `DomainEventMap` are the subscription/typing primitives used in `subscribe` and `publicEvents`.
- **`src/kernel/required-config.ts`** – `checkSelector` is called inside `customCheck` to fail boot early if `NODE_PAYMENT_PROVIDER` cannot be resolved.
- **`src/modules/orders/index.ts`** – Source of the `ORDER_REFUND_OWED` and `ORDER_CANCELLED` event constants this module subscribes to.
- **`src/modules/payments/config.ts`** – Provides `validateBankTransferConfig` and `validateStripeSecretKey` used in `customCheck`.
- **`src/modules/payments/events.ts`** – Provides `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED`. Imported directly (not via the module barrel) per the CLAUDE.md module-barrel rule.
- **`src/modules/payments/providers/index.ts`** – `resolvePaymentProvider` is invoked inside `checkSelector` to surface a clear error at boot rather than on the first payment.
- **`src/modules/payments/rate-limits.ts`** – Supplies the `paymentsRateLimits` budget object for webhook and card-testing endpoints.
- **`src/modules/payments/routes.ts`** – The Hono router mounted under `/payments`; `rawBodyPaths: ['/webhook']` is relative to this mount.
- **`src/modules/payments/services/index.ts`** – `refundForOrder`, `cancelOpenIntentForOrder`, `detachUserId`, `findOwnPaymentsForExport` are the service functions wired into subscriptions and personal-data hooks.
- **`src/modules.ts`** – Top-level barrel that aggregates this module's default export alongside other modules for the kernel.

## Notes

- The `ORDER_CANCELLED` listener is **not** a refund path. It only attempts to close a still-open provider intent (E17). The actual refund is driven exclusively by `ORDER_REFUND_OWED`.
- `rawBodyPaths` entries are relative to `basePath`; the app tier composes them so the mount point is stated once and cannot drift.
- `NODE_PAYMENT_WEBHOOK_SECRET` is marked `productionOnly`; dev/test environments use the `fake` provider and skip it.
- `personalData.erase` detaches (nullifies) the user reference inside the same transaction that hard-deletes the user row — it does **not** delete the payment record. The payment outlives the account.
- The scenario id is the **order** id, not the payment id, because `GET /payments/order/{orderId}` is the sole public read path for a payment.
