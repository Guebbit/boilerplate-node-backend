---
source: src/modules/stock-alerts/events.ts
sha256: 729d71193788ec32f19548434155fc99358c8089ebc8dfff4b303663637ec67c
generated_at: 2026-11-08T08:28:03.163442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/events.ts

## Purpose

Declares the stock-alerts module's domain event (`stock_alert.sent`) by augmenting the kernel's `DomainEventMap` rather than editing the central map directly, and exports a single spelling constant so emitters and listeners agree on the event name.

## Key elements

- **`declare module '@kernel/events'`** — Adds the `stock_alert.sent` entry to `DomainEventMap` with a payload of `userId`, `productId`, and `titles: Record<string, string>` (product name keyed by locale, captured at send-time so it survives product deletion).
- **`STOCK_ALERT_SENT`** — Exports the literal string `'stock_alert.sent'` as a shared constant for emitters and listeners.

## Relationships

- **`service.ts`** — Emits `STOCK_ALERT_SENT` (via the outbox) in the same transaction that deletes the user's stock-alert request.
- **`index.ts`** — Re-exports `STOCK_ALERT_SENT` so consumers of the module get the event name without reaching into this file.
- **`tests/integration/stock-alerts.test.ts`** — Asserts the outbox row shape (including the `titles` map) after a request is fulfilled.
- **`tests/integration/draft-language-never-leaks.test.ts`** — Verifies that the `titles` payload contains only published locale strings, not draft content.

## Notes

- The `titles` field is intentionally denormalized: it snapshots the product's localized name so the inbox row remains meaningful even if the product row is later removed.
- The event is written to an outbox within the same DB transaction that deletes the alert request — the inbox row exists *exactly* when the request no longer does.
- The module augmentation pattern means adding a new stock-alert event here does not require touching the kernel's source file.
