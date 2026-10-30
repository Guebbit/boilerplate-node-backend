---
source: src/modules/delivery/services/retention.ts
sha256: 1f05fb5b59efce04c70dc6435af2834d7730d921c77ca5bfdbe96517cb3b35c5
generated_at: 2026-10-29T03:43:37.203773+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/retention.ts

## Purpose

Implements the personal-data retention sweeps for the delivery module. When a fulfillment order or shipment has been quiet long enough, this file unsets the free-form text staff typed (hold notes, lost-parcel notes) and the destination address copies on shipments. The underlying rows stay; only the personal text goes.

## Key elements

- **`scrubHoldNotes(now?)`** — Unsets `holdNote` on every fulfillment order whose `updatedAt` predates the retention cutoff. Returns the scrub count.
- **`scrubLostNotes(now?)`** — Unsets `lostNote` on every shipment quiet for the same window. `lostMessage` (buyer-facing) is intentionally left untouched. Returns the scrub count.
- **`scrubDestinations(orderId)`** — Wipes the `destination` address copy on all shipments of a given order, called after the order's own address is redacted. Idempotent.

## Relationships

- **`@infrastructure/adapters/logger`** — Logs an info line when a sweep actually modified rows (`scrubbed > 0`).
- **`../repository`** — Delegates the actual row updates to `fulfillmentOrderRepository.scrubHoldNotesBefore` and `shipmentRepository.scrubLostNotesBefore` / `unsetDestinations`.
- **`../config`** — Reads `holdNoteRetentionDays()` (backed by `NODE_HOLD_NOTE_RETENTION_DAYS`) to compute the cutoff timestamp.
- **`@domain-primitives/time`** — Imports `DAY_MS` to convert the day-based retention value into milliseconds.
- **`../jobs`** — The `reap:delivery` job is the caller that invokes `scrubHoldNotes` and `scrubLostNotes` as its two sweeps.
- **`../services/index`** — Re-exports the three functions so consumers can import from the services barrel.
- **`../tests/integration/retention.test.ts`** — Integration tests exercising all three functions against a real repository.

## Notes

- The cutoff is based on `updatedAt`, **not** a closing date, because a fulfillment order that is held indefinitely never closes.
- `scrubLostNotes` deliberately reuses the *same* `holdNoteRetentionDays` window; there is no separate config for lost-note retention.
- The `now` parameter defaults to `new Date()` but is injectable so tests avoid fake timers.
- `scrubDestinations` is idempotent by design: a redelivered "address redacted" event simply finds nothing left to unset.
- Stryker mutation-testing suppressions (`// Stryker disable next-line all`) guard the logger lines to prevent the mutation from being "killed" trivially.
