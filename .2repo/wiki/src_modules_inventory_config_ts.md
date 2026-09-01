# src/modules/inventory/config.ts

## Purpose

Single source of truth for the two inventory deployment knobs (reservation TTL and low-stock threshold). Exists to eliminate the transcription risk of duplicating a default value across consumers — a problem that actually occurred before this file was extracted. Both values are read per call (not captured at import) so an operator env-var change takes effect on the next request and tests can vary them case-by-case.

## Key elements

- **`reservationTtlMinutes()`** — Returns the hold-without-payment window in minutes (`NODE_RESERVATION_TTL_MINUTES`, default 30, floor 0). Stamped at reserve time; a later change affects only new checkouts.
- **`lowStockThreshold()`** — Returns the availability level at or below which a product is considered needing restock (`NODE_LOW_STOCK_THRESHOLD`, default 5, floor 0).

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — Sole import; provides `environmentNumber` which resolves an env var with a default and a floor value.
- **`src/modules/inventory/service.ts`** — Consumer of `reservationTtlMinutes` (stamped at reserve time) and `lowStockThreshold` (the "admin board" spanning the full catalogue).
- **`src/modules/inventory/metrics.ts`** — Consumer of `lowStockThreshold` (the "gauge" scoped to public products only).

## Notes

- Both exports are **arrow functions, not constants**. They must be called at the point of use; importing the bare value would freeze the read at module-load time and defeat the per-call design.
- `lowStockThreshold` is intentionally shared by two readers that count **different populations** (whole catalogue vs. public-only). Their resulting counts will not match; this is expected, not a bug.
- The floor argument to `environmentNumber` is `0` for both, meaning a misconfigured env var will degrade to "no TTL" / "everything is low stock" rather than throwing.
