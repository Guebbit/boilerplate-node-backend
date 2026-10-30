---
source: src/modules/stock-alerts/events.ts
sha256: 729d71193788ec32f19548434155fc99358c8089ebc8dfff4b303663637ec67c
generated_at: 2026-10-29T05:58:07.475926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/events.ts

## Purpose

Declares the stock-alerts module's domain event (`stock_alert.sent`) by augmenting the kernel's shared `DomainEventMap` interface, and exports a single name constant so emitters and listeners reference the same string literal.

## Key elements

- **Module augmentation on `@kernel/events`** — Adds the `stock_alert.sent` key and its payload type to the app-wide `DomainEventMap` interface, so the kernel's event catalogue knows this shape without the kernel itself needing to import the module.
- **`stock_alert.sent` payload** — `{ userId: string; productId: string; titles: Record<string, string> }`. Emitted in the same transaction that deletes the buyer's alert request (outbox pattern). `titles` snapshots the product's display name per locale so the inbox row remains readable even after the product record is gone.
- **`STOCK_ALERT_SENT`** (exported const) — The string `'stock_alert.sent'`, provided so emitters and listeners share one spelling rather than each hard-coding the key.

## Relationships

- **`src/modules/stock-alerts/service.ts`** — The service layer is the likely emitter: it references `STOCK_ALERT_SENT` to publish the event via the kernel's outbox when fulfilling an alert.
- **`src/modules/stock-alerts/index.ts`** — Module barrel; re-exports `STOCK_ALERT_SENT` (and the payload type) so external consumers import from the module root.
- **`src/modules/stock-alerts/tests/integration/stock-alerts.test.ts`** — Integration tests that exercise the alert lifecycle and assert the `stock_alert.sent` event is emitted with the expected payload.
- **`tests/integration/draft-language-never-leaks.test.ts`** — Cross-module test that (among other checks) verifies the `titles` field in this event does not expose draft or unpublished product names.

## Notes

- The event is intentionally tied to a **deletion**: the inbox row exists *exactly when* the request row does not. Any consumer that assumes the alert request still exists after receiving this event will be wrong.
- `titles` is a denormalized snapshot, not a live reference. If you need the *current* product name after a rename, this payload will be stale by design.
- Adding a new stock-alert event means extending the `DomainEventMap` augmentation in this file (not editing the kernel), keeping the kernel's catalogue open-ended.
