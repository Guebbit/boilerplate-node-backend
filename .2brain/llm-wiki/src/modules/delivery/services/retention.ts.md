---
source: src/modules/delivery/services/retention.ts
sha256: 1f05fb5b59efce04c70dc6435af2834d7730d921c77ca5bfdbe96517cb3b35c5
generated_at: 2026-11-08T05:39:27.465837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/retention.ts

## Purpose

Implements the `reap:delivery` retention sweep: it scrubs personal free-text data (staff hold notes, loss notes, and shipment destination addresses) from fulfillment orders and shipments once the associated order has been quiet past the configured retention window. It exists to satisfy the data-retention policy that only personal text goes while the structural record of what was promised and shipped stays.

## Key elements

- **`scrubHoldNotes(now?)`** — Unsets `holdNote` on fulfillment orders whose `updatedAt` is older than `holdNoteRetentionDays`. Returns the number of rows affected.
- **`scrubLostNotes(now?)`** — Unsets `lostNote` on shipments quiet for the same retention window. Deliberately leaves `lostMessage` intact (buyer-facing, already mailed).
- **`scrubDestinations(orderId)`** — Unsets the address copy on every shipment belonging to a given order (called after the order's own address is redacted). Idempotent.

## Relationships

- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` to convert the retention-days config into a millisecond offset.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; emits an `info` entry whenever a sweep actually modifies rows.
- **`src/modules/delivery/config.ts`** — Imports `holdNoteRetentionDays` (a function, not a constant) to read the active retention window.
- **`src/modules/delivery/repository.ts`** — Imports `fulfillmentOrderRepository` and `shipmentRepository`; delegates all row-level work to their `scrub*` / `unset*` methods.
- **`src/modules/delivery/jobs.ts`** — The `reap:delivery` job references these three exports as its sweep steps (per the JSDoc).
- **`src/modules/delivery/services/index.ts`** — Barrel re-exports this module so consumers import from the services index.
- **`src/modules/delivery/tests/integration/retention.test.ts`** — Integration tests exercise all three functions against a real repository.

## Notes

- Recency is measured against `updatedAt`, **not** a close/finish date, because a fulfillment order held indefinitely never closes.
- Both `scrubHoldNotes` and `scrubLostNotes` share the same retention window (`holdNoteRetentionDays`); they are not independently configurable.
- The `now` parameter defaults to `new Date()` but is injectable so tests can pin the clock without fake timers.
- `scrubDestinations` is intentionally idempotent: a redelivered redaction event for the same order is a no-op.
- Stryker mutation-testing disables (`// Stryker disable`) guard the logger lines so the coverage tool doesn't flag them as untested branches.
