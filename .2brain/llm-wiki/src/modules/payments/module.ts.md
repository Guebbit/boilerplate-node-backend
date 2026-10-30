---
source: src/modules/payments/module.ts
sha256: 94bccd341f94ee6aa0304a8b2e05e6ac6b0ef2e2af9e4dda03ecd9c2c3cf3dea
generated_at: 2026-10-29T05:07:08.876954+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.ts

## Purpose

The module manifest (default export) for the payments domain. It is the single registration point where the payments module wires itself into the application: HTTP routes, domain-event subscriptions, webhook-visible public events, personal-data (GDPR) hooks, rate limits, config slices, background jobs, and an admin demo scenario. Everything the app tier needs to "mount" payments is declared here.

## Key elements

- **`publicEvents`** — Maps seven internal domain events (`PAYMENT_SUCCEEDED`, `FAILED`, `REFUNDED`, `REFUND_FAILED`, `REFUND_REVERSED`, `DISPUTE_OPENED`, `DISPUTE_UPDATED`) to webhook-facing `PublicEventTarget` objects. Each entry defines the public `eventType` string and a `toPublicEvent` payload transformer. Consumed generically by `webhooks/services/publish.ts` via the kernel registry; never imported by name outside this file.
- **Default export (`AppModule`)** — The manifest object with:
  - `mounts` — Two route mounts: `/payments` (primary router) and `/orders` (order-scoped payment routes, e.g. `POST /orders/{id}/payments`).
  - `jobs` — Background jobs from `./jobs`.
  - `rateLimits` — Webhook and card-testing budgets from `./rate-limits`.
  - `rawBodyPaths: ['/webhook']` — Relative to the first mount's `basePath`; tells the app tier to preserve raw bytes for provider signature verification.
  - `config` — Slices for `paymentsConfig` and `paymentProviderProbe`.
  - `personalData` — A `payments` section with `collect` (export a user's payments) and `erase` (detach `userId`, never delete the row).
  - `subscribe()` — Registers four domain-event handlers (see Notes).
  - `scenario` — Admin demo: a refunded card payment reached via `GET /orders/{id}/payments`.
- **`subscribe()`** — Event wiring:
  - `ORDER_CANCELLED` → best-effort close of any open provider intent, then (if the order carries a `refund` flag) issue a refund. The refund is outbox-backed for retry.
  - `ORDER_CREATED` → open a bank-transfer payment with reference and instructions.
  - `PAYMENT_SUCCEEDED` / `PAYMENT_REFUNDED` → send confirmation mails.
  - `PAYMENT_REFUND_FAILED` / `PAYMENT_REFUND_REVERSED` → send a single "refund undeliverable" mail (the listener inspects the record to avoid false positives).

## Relationships

- **`src/kernel/events.ts`** — Provides `onDomainEvent` and the `DomainEventMap` type used for type-safe subscription handlers in `subscribe()`.
- **`src/kernel/registry.ts`** — Supplies the `AppModule` and `PublicEventTarget` types that shape the default export. The `publicEvents` record is later resolved by `resolvePublicEvents` in the registry for webhook dispatch.
- **`src/modules/orders/index.ts` / `module.ts`** — Source of `ORDER_CANCELLED` and `ORDER_CREATED` events that this module subscribes to. The payments module conceptually "owns" the money side of an order; orders own the state machine.
- **`src/modules/orders/module.yaml`** — Order module configuration; the `refund` flag that gates the cancel-refund path is declared in orders' schema/config.
- **`src/modules/cart/tests/integration/*.test.ts`** — Cart integration tests (backorder, preorder, stock, merge, line-availability, product-removal) exercise flows that can produce `ORDER_CREATED`/`ORDER_CANCELLED` and thereby trigger this module's subscriptions.
- **`src/modules/invoicing/tests/integration/*.test.ts`** — Credit-note tests that exercise refund and payment-lifecycle paths adjacent to this module.

## Notes

- **Event imports bypass the barrel.** The domain-event constants (`PAYMENT_SUCCEEDED`, etc.) are imported directly from `./events`, not through this module's own barrel, per the project's "module-barrel rule" (see `CLAUDE.md`). Do not "clean up" these imports into a barrel re-export.
- **`rawBodyPaths` is relative to the first mount.** The path `'/webhook'` is composed with the `/payments` basePath by the app tier. Adding a second mount that also needs raw bodies requires a new relative path entry.
- **Erasure is detach, not delete.** `personalData.erase` calls `paymentService.detachUserId`, which nulls the user reference inside the same hard-delete transaction. The payment row survives—same policy as the order it settled.
- **`scenario` id is the order's, not the payment's.** The demo key `'payment.refunded'` is looked up via `GET /orders/{id}/payments`, so the identifier behind the row is the order id.
