---
source: src/modules/delivery/domain/lifecycle.ts
source_sha256: a097ef00315beb1975605347ef54432c9ac416d96fb2597a2a303e5e6af19304
context_sha256: aa77fb589e1a4c014b18704568b9021c6e4a0cb5f269bc8215e0d1cf0a9b5db9
generated_at: 2026-11-22T04:48:06.020922+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/lifecycle.ts

## Purpose
Defines the shipment status lifecycle as a single pure table (no I/O) that every repository write, `actions` flag and test reads. It declares which events can move a shipment between statuses and builds the validated lifecycle object from them.

## Key elements
- `ShipmentEvent`: union type `'deliver' | 'lose' | 'find'`.
- `SHIPMENT_EVENTS`: maps each event to the statuses it may start from and the one it lands on:
  - `deliver`: `shipped` → `delivered`
  - `lose`: `shipped` → `lost`
  - `find`: `lost` → `delivered`
  
  It is declared `as const satisfies Record<ShipmentEvent, LifecycleEvent<ShipmentStatus>>`, so it keeps literal types and is checked against the primitive's event shape.
- `shipmentLifecycle`: the result of `defineLifecycle<ShipmentStatus, ShipmentEvent>(...)`. It is given all `ShipmentStatus` values and `{ initial: ShipmentStatus.shipped, events: SHIPMENT_EVENTS }`. The table is checked once, at load.

## Relationships
- `src/domain-primitives/lifecycle.ts`: supplies `defineLifecycle` and the `LifecycleEvent` type that this file uses to build and type the table.
- `src/types/index.ts`: supplies the `ShipmentStatus` enum, imported through the `@types` alias.
- `src/modules/delivery/repository.ts` and `src/modules/delivery/services/actions.ts`: according to the file's doc comments, repository writes and `actions` flags consult `shipmentLifecycle` instead of spelling out statuses.
- `src/modules/delivery/domain/index.ts` and `src/modules/delivery/tests/unit/lifecycle.test.ts`: graph neighbors, presumably the domain barrel and the unit test. The file itself shows no detail on how they use it.

## Notes
- Births are not events. A digital shipment is born `delivered` (written in `src/modules/delivery/services/cut.ts`), and a physical one is born `shipped`, which is the lifecycle's `initial` status. Neither goes through this table.
- The module doc comment points to the `the-two-records` section of `src/modules/delivery/model.ts` for background.
