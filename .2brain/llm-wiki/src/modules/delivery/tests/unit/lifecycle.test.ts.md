---
source: src/modules/delivery/tests/unit/lifecycle.test.ts
source_sha256: f3647e2c03579eb85c62f18472ecc934ecd0dfbbce6a1523c6a9db01384e0d79
context_sha256: d1808ac0cdc41954cc6f8620fec1e9c8e046ce813baa7aa6126b66f69207a7b2
generated_at: 2026-11-22T05:04:23.492845+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/lifecycle.test.ts

## Purpose
Unit tests for `shipmentLifecycle`, the delivery module's shipment state machine. They check which events are allowed from each `ShipmentStatus`, where each event leads, what the initial status is, and that building a lifecycle with an incomplete status list fails.

## Key elements
- **`describe('shipmentLifecycle')`** is the only suite. It has six tests.
- **Allowed events per status** (`eventsFrom`):
  - `shipped` allows `['deliver', 'lose']`.
  - `lost` allows `['find']`.
  - `delivered` allows `[]`, so it is terminal.
- **Event targets** (`toOf`):
  - `deliver` leads to `delivered`.
  - `lose` leads to `lost`.
  - `find` leads to `delivered`.
- **Initial status**: `shipmentLifecycle.initial` is `ShipmentStatus.shipped`. The test title calls this a birth, not a move.
- **Load-time validation**: the test calls `defineLifecycle` with every `ShipmentStatus` value except `lost`, plus the real `SHIPMENT_EVENTS`. It expects a throw matching `/unknown "lost"/`.

## Relationships
- `src/modules/delivery/domain/index.ts` exports `shipmentLifecycle` and `SHIPMENT_EVENTS`, which are the subjects under test.
- `src/modules/delivery/domain/lifecycle.ts` is a neighbor, but this file does not import it directly. It imports only from the domain index.
- `src/domain-primitives/lifecycle.ts` provides `defineLifecycle`, which the last test calls directly to check validation.
- `src/types/index.ts` provides `ShipmentStatus`, imported as `@types`. It is used for expected values and to build the reduced status list.

## Notes
- The validation test shows that `defineLifecycle` rejects an event table that refers to a status missing from the list it was given. The error message names the offending status.
- The event names (`deliver`, `lose`, `find`) are asserted as string literals. Renaming an event breaks these tests.
