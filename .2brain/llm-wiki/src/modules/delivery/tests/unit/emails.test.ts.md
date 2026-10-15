---
source: src/modules/delivery/tests/unit/emails.test.ts
sha256: 5f8d2427afa5f98ad0d365a5b9317d441cc36b938329fd3bf876699e44e9526e
generated_at: 2026-10-15T10:29:08.382276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/emails.test.ts

## Purpose

Unit tests for the two shipment email builders (`shipmentShippedEmail`, `shipmentDeliveredEmail`). They verify that the customer-facing fields a recipient must act on—tracking code, line items, remaining-units notice, withdrawal deadline—are populated correctly, are locale-aware, and never leak unresolved i18n keys or template placeholders.

## Key elements

- **Shared fixtures** — `NAME` (`'Ada Lovelace'`), `CODE` (`'TRK-99887766'`), `LINES` (two items), and `completing` (a shipment with `remainingUnits: 0`) used across both `describe` blocks.
- **`describe('shipmentShippedEmail', …)`** — asserts template ID, tracking-code presence (and absence when `trackingCode` is `undefined`), line-item formatting (`"2 × Analytical Engine"`), conditional `more` field, greeting, full i18n resolution (no empty values, no `delivery.*` key echoes), and locale pass-through.
- **`describe('shipmentDeliveredEmail', …)`** — asserts template ID, line-item list, greeting, conditional `withdraw` field (only when `withdrawUntil` is supplied), locale-aware date formatting (UTC), and full i18n resolution.

## Relationships

- **`src/modules/delivery/emails.ts`** — sole dependency under test; provides `shipmentShippedEmail` and `shipmentDeliveredEmail`. The tests call each builder with `(locale, name, shipmentData)` and assert on the returned `{ template, subject, data }` object.

## Notes

- The "resolves every copy slot" tests guard against a class of bug where an i18n key (e.g. `delivery.shipment-shipped`) is returned verbatim instead of translated copy. They check that no value is empty **and** does not start with `delivery.`.
- The tracking-code test explicitly rejects `{{` in the output, catching a half-interpolated template string.
- `data.more` is expected to be `undefined` (not an empty string) when `remainingUnits` is `0`; `data.withdraw` is expected `undefined` when no `withdrawUntil` is passed.
- The withdrawal date is asserted as a UTC calendar date (`November 14, 2026` / `14 novembre 2026`), not a timestamp, confirming the builder localizes a UTC instant.
