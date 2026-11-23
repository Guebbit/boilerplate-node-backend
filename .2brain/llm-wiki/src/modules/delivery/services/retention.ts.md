---
source: src/modules/delivery/services/retention.ts
source_sha256: 69494e0a02542357ff668ef084cebc1afab3e099cd37c0d6fcbe917a29b1f599
context_sha256: ffe3cbfcc0145ccae44dbfaa6728d152198b20a42814cba5988579132ceeae89
generated_at: 2026-11-22T04:58:42.441116+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/retention.ts

## Purpose
Implements the delivery module's data-retention rules. Delivery rows are kept as the record of what was promised and shipped. Only personal free text is wiped: hold notes on fulfillment orders, loss notes on shipments, and the address copy on shipments when the parent order's address has been scrubbed.

## Key elements
- `scrubHoldNotes(now = new Date())` is the first sweep of `reap:delivery`. It unsets `holdNote` on fulfillment orders whose `updatedAt` is older than `holdNoteRetentionDays()`, and returns the count scrubbed. It uses `updatedAt` rather than a closing date because an order held forever never closes.
- `scrubLostNotes(now = new Date())` is the second sweep of `reap:delivery`. It unsets `lostNote` on shipments quiet for the same window as hold notes, and returns the count. `lostMessage` is left alone because it was written for the buyer and mailed to them.
- `scrubDestinations(orderId)` unsets the address copy (destination) on every shipment of an order whose address was scrubbed (`order.redacted`). It is idempotent, so a redelivered event finds nothing left to unset. It returns the count.

## Relationships
- `src/modules/delivery/repository.ts`: supplies `fulfillmentOrderRepository` and `shipmentRepository`, which perform the actual writes (`scrubHoldNotesBefore`, `scrubLostNotesBefore`, `unsetDestinations`). This file only computes the cutoff and logs.
- `src/modules/delivery/config.ts`: `holdNoteRetentionDays()` supplies the retention window. The doc comment names the env var `NODE_HOLD_NOTE_RETENTION_DAYS`.
- `src/domain-primitives/time.ts`: `DAY_MS` converts days to milliseconds for the cutoff.
- `src/infrastructure/adapters/logger.ts`: both sweeps log an info message with the count when it is above zero.
- `src/modules/delivery/jobs.ts` and `src/modules/delivery/services/index.ts` are graph neighbors, but this file does not import either. The doc comments describe the two note sweeps as `reap:delivery` sweeps.
- `src/modules/delivery/tests/integration/retention.test.ts` is a graph neighbor and appears to be the integration test for this module.

## Notes
- `now` is injectable so tests need no fake timers.
- Both note sweeps share `holdNoteRetentionDays()`. There is no separate setting for lost notes.
- Logging is skipped when nothing was scrubbed. The log calls are marked `Stryker disable` to exclude them from mutation testing.
- `scrubDestinations` does not log.
