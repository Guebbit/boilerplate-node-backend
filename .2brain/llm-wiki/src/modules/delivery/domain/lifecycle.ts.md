---
source: src/modules/delivery/domain/lifecycle.ts
sha256: 9266286df6ad58d08aff53d2c17c1d139f74e0f978b048f15d96004572b43082
generated_at: 2026-11-14T19:39:34.899171+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/lifecycle.ts

## Purpose

Defines the shipment lifecycle as a pure data table (no I/O) that maps the three allowed status transitions—`deliver`, `lose`, `find`—and declares the birth status for physical parcels. Every repository write and service action validates against this table rather than spelling out statuses independently.

## Key elements

- **`ShipmentEvent`** (type) — The union `'deliver' | 'lose' | 'find'`, the only legal transitions a shipment can undergo after birth.
- **`SHIPMENT_EVENTS`** (const) — A `const` record mapping each event to its allowed `from` statuses and target `to` status. Annotated `satisfies Record<ShipmentEvent, LifecycleEvent<ShipmentStatus>>` so the compiler enforces completeness without widening the type.
- **`shipmentLifecycle`** (const, export) — The validated lifecycle object produced by `defineLifecycle`. Exposes `initial: ShipmentStatus.shipped` (the birth status for a physical parcel) and the full event table. Checked once at module load.

## Relationships

- **`src/domain-primitives/lifecycle.ts`** — Provides the `defineLifecycle` factory and the `LifecycleEvent` type that this module consumes to build and type its table.
- **`src/types/index.ts`** — Source of the `ShipmentStatus` enum used throughout the transition definitions.
- **`src/modules/delivery/repository.ts`** — Consumes `shipmentLifecycle` to validate writes before persisting a status change.
- **`src/modules/delivery/services/actions.ts`** — Consults `shipmentLifecycle` when raising flags (deliver / lose / find) on a shipment.
- **`src/modules/delivery/domain/index.ts`** — Barrel re-export for this module.
- **`src/modules/delivery/tests/unit/lifecycle.test.ts`** — Unit-tests the transition rules and the `initial` status.

## Notes

- A **birth** (a shipment first appearing) is deliberately **not** an event here. Digital shipments are born `delivered` (see `services/cut.ts`); physical ones are born `shipped`. Birth is a write, not a lifecycle transition, so it does not appear in `SHIPMENT_EVENTS`.
- `SHIPMENT_EVENTS` is declared `as const satisfies …`, giving literal-level typing while still enforcing the `LifecycleEvent` contract. Don't loosen to a plain object annotation.
- The table is intentionally flat (single-source-of-truth). If a new status or transition is needed, add it here first; `repository.ts` and `actions.ts` pick it up automatically.
