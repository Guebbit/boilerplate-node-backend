---
source: src/modules/inventory/config.ts
sha256: 8d02679978cf77239c63e4eecc93941285afc438d6f0c1fefa136c0092eaff5f
generated_at: 2026-09-23T18:43:26.707814+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/config.ts

## Purpose

Centralizes two deployment-tunable numbers (reservation TTL and low-stock threshold) in a single read point so that independent consumers—the admin stock board and the public gauge—cannot drift apart on what "low" or "expired" means.

## Key elements

- **`reservationTtlMinutes(): number`** — Reads `NODE_RESERVATION_TTL_MINUTES` (default 30, floor 0). Returns the hold window in minutes for a reserved-but-unpaid item. Evaluated per call so changes apply to new checkouts without altering already-stamped holds.
- **`lowStockThreshold(): number`** — Reads `NODE_LOW_STOCK_THRESHOLD` (default 5, floor 0). Returns the availability level at or below which a product is flagged for restocking. Shared by two readers that count different populations (whole catalogue vs. public products), so their numeric results legitimately differ.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentNumber`, the sole helper both exports call to parse and floor-clamp the env-var value at invocation time.
- **`src/modules/inventory/service.ts`** — Consumer of both exports (reservation logic and low-stock detection). Reads the values per request rather than caching them, so env-var changes take effect on the next call.

## Notes

- Both functions are **call-time readers**, not module-level constants. This is intentional: an operator changing the env var affects the very next request, and tests can vary values case-by-case without re-importing.
- The docstring explicitly warns that the two `lowStockThreshold` readers (board vs. gauge) will produce _different_ numbers because they filter different product sets; this is expected, not a bug.
- `environmentNumber` is called with a floor of `0` on both, so a misconfigured negative value is silently clamped rather than rejected.
