---
source: src/modules/payments/module.ts
sha256: 56e28ea1298d1030ab5b15ec90e14fce768edd037d8d7330e66e5b8da88e0efc
generated_at: 2026-10-15T11:26:39.488735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.ts

## Purpose

The module registration manifest for the payments domain. It wires together the module's routes, public-event mappings, event subscriptions, provider config, personal-data hooks, and rate-limit budgets into a single `AppModule` object that the app tier loads. It exists so that the rest of the codebase never imports payment internals directly—everything goes through this one exported manifest.

## Key elements

- **`publicEvents`** (const, not exported) — Maps the three domain events (`PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED`) to their public webhook payloads. `payment.refunded` additionally surfaces `amount` and `currency` so subscribers skip a lookup. Consumed generically by `webhooks/services/publish.ts` via `resolvePublicEvents` in `kernel/registry.ts`.
- **`default` export** (`AppModule`) — The manifest object. Key fields:
  - `routes` / `basePath: '/payments'` — HTTP surface.
  - `rawBodyPaths: ['/webhook']` — Tells the app tier to preserve raw bytes on the webhook route for provider signature verification.
  - `config` — Splices `paymentsConfig.slice` and `paymentProviderProbe.slice` into the app's config tree.
  - `personalData` — Exports a payment listing (`collect`) and detaches the user id (`erase`) on account erasure; the payment row itself is never deleted.
  - `subscribe` — Registers four domain-event listeners: `ORDER_REFUND_OWED → refundForOrder`, `ORDER_CANCELLED → cancelOpenIntentForOrder` (best-effort, never rethrows), `PAYMENT_SUCCEEDED → mailPaymentReceived`, `PAYMENT_REFUNDED → mailRefundIssued`.
  - `scenario` — `shop: ['payment.refunded']`; the key is the **order** id, not the payment id, because `GET /payments/order/{orderId}` is the sole read path.
  - `locales` / `templates` — Resolved relative to this file's directory.
- **`paymentsRateLimits`** — Imported from `./rate-limits` and attached to the manifest; governs webhook and card-testing budgets.

## Relationships

- **`src/modules/orders/index.ts`** (re-exported as `@modules/orders`) — Source of `ORDER_REFUND_OWED` and `ORDER_CANCELLED`, the two order-side events this module subscribes to. This is the primary cross-module coupling.
- **`src/kernel/registry.ts`** — Provides the `AppModule` and `PublicEventTarget` types that shape the default export; its `resolvePublicEvents` is the runtime consumer of `publicEvents`.
- **`src/kernel/events.ts`** — Provides `onDomainEvent` (used inside `subscribe`) and the `DomainEventMap` type (used to type each `toPublicEvent` payload).
- **`src/modules/payments/config.ts`** — Supplies `paymentsConfig`, whose `.slice` is embedded in the manifest's `config` array.
- **`src/modules/payments/events.ts`** — Supplies `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED`. Imported directly (not through the module barrel) per the project's barrel rule.
- **`src/modules.ts`** — The top-level module aggregator that loads this manifest into the running app.

## Notes

- **Refund vs. cancel semantics are intentionally split.** `ORDER_REFUND_OWED` triggers the actual refund; `ORDER_CANCELLED` only closes a still-open provider intent. `ORDER_CANCELLED` is *never* a refund trigger—do not conflate the two when adding listeners.
- **The `scenario` key is an order id.** Any admin UI or fixture that references this scenario must key by `orderId`, not `paymentId`, because no route exists to fetch a payment by its own id.
- **`detachUserId` is an erase, not a delete.** The payment row persists after account erasure, consistent with the order it funds. Tests or migrations that hard-delete payment rows on user deletion are wrong by design.
- **`rawBodyPaths` must stay in sync with the provider webhook path.** The comment notes the relative path is composed against `basePath` by the app tier; if you rename the webhook route, update both the route registration and this array, or signature verification breaks silently.
