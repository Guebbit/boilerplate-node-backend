---
source: src/modules/notifications/module.ts
sha256: ba2f2179772c30b931a5fe360999715d3c78c6073fc9e819e09821f4069d56b8
generated_at: 2026-10-29T04:29:15.677585+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/module.ts

## Purpose

The module manifest for the notifications inbox. It registers the module's routes, domain-event subscriptions, config, background jobs, personal-data handlers, and asset paths with the application kernel. All inbound communication is via subscribed domain events; no other module imports this file to send a message, which keeps the dependency graph acyclic and producers ignorant of the inbox.

## Key elements

- **`export default`** — the `AppModule` object satisfying the kernel's manifest contract.
- **`subscribe()`** — calls `onDomainEvent` for each event this module reacts to (cart lines removed, wishlist items removed, cart merge refused, fulfillment delays/holds, shipment lost, purchase hold, webhook auto-disable, return requested, outbox dead-letter, ticket opened/assigned, stock alert sent).
- **`personalData`** — two sections (`notifications`, `staffNotifications`) providing `collect` and `erase` callbacks for user-data requests; both sections refer to the same underlying rows.
- **`mounts`** — registers `router` at `/notifications`.
- **`config`** — exposes `notificationsConfig.slice`.
- **`jobs`** — exposes `notificationsJobs`.
- **`locales` / `templates`** — filesystem paths for i18n strings and message templates.

## Relationships

- **Kernel:** imports `AppModule` (registry), `onDomainEvent` (events), `OUTBOX_EVENT_DEAD` (outbox) to hook into the framework lifecycle.
- **Producer modules (event names only):** imports constant event identifiers from `cart`, `delivery`, `orders`, `returns`, `tickets`, `webhooks`, `stock-alerts`, and `wishlist`. These are read-only type-level dependencies — no service or route from those modules is imported.
- **Siblings:** pulls in `config`, `jobs`, `routes`, and `services` from the same `notifications/` directory.
- **`src/modules.ts`:** listed as one of the application's registered modules.

## Notes

- The `personalData` section defines two entries (`notifications` and `staffNotifications`) that operate on the **same rows**. The second entry's `erase` is intentionally omitted; deletion is handled entirely by the first entry's `erase` callback (`notificationsService.removeByUserId`), which joins the caller's hard-delete transaction.
- `STOCK_ALERT_SENT` is subscribed to here even though the stock-alerts module is the *producer*; the notifications module only needs the event name constant, not the producer's logic.
- The file header comment explicitly states the one-directional contract: nothing imports this module to trigger a send. Any new producer must publish a domain event rather than calling into notifications directly.
