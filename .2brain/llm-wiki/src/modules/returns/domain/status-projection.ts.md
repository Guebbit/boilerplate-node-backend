---
source: src/modules/returns/domain/status-projection.ts
source_sha256: 40955ef23b94e201586380faa53f371a353cc111cfa25e649943bdf61129fa41
context_sha256: 5e2bdee599032f4ee8128aaa0c8310569db971bdf691080bfa7f587fca89b513
generated_at: 2026-11-22T07:24:42.108431+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/status-projection.ts

## Purpose
Pure function that collapses all returns on an order into the single status word that `orders` shows beside its own status (`requested`, `in_progress`, `partially_returned`, `returned`, or `undefined` for "none"). It has no database dependency, so every state and boundary can be unit-tested directly.

## Key elements
- `ProjectedReturn` — the minimal shape of a return the projection reads: `status`, `kind`, optional `remedy`, and `lines` (`productId` + `quantity`).
- `ProjectedReturnStatus` — `OrderReturnStatus` without `'none'`, or `undefined` (absence of a stamp means `none`).
- `projectReturnStatus(returns, ordered)` — the projection itself. `ordered` is a map of productId → units still able to come back (order quantities minus what a remainder cancel took).

Resolution order:
1. Only "holding" returns count: `kind === 'return'`, at least one line, status in `QUANTITY_HOLDING_RETURN_STATUSES`, and not `handsUnitsBack({ remedy })`. If none, result is `undefined`.
2. Any holding return `requested` → `'requested'`.
3. Else any `approved` → `'in_progress'`.
4. Else sum returned quantities per product; if every product in `ordered` is covered → `'returned'`, otherwise `'partially_returned'`.

## Relationships
- `./lifecycle` — supplies `QUANTITY_HOLDING_RETURN_STATUSES`, `handsUnitsBack`, and the `ReturnKind`/`ReturnRemedy`/`ReturnStatus` types.
- `./quantities` — `quantitiesByProduct` totals the units across holding returns' lines.
- `@types` (`src/types/index.ts`) — provides `OrderReturnStatus`.
- `src/modules/returns/domain/index.ts` — domain barrel for this module.
- `src/modules/returns/services/projection.ts` — service-layer counterpart that sits alongside this pure logic.
- Tests: `src/modules/returns/tests/unit/status-projection.test.ts` and `src/modules/delivery/tests/unit/fulfillment.test.ts`.

## Notes
- Cancellations, declined returns, returns with no lines (e.g. a pre-dispatch withdrawal), and replacement/repair remedies are all excluded and never influence the result.
- `ordered` must already net out canceled units; otherwise a remainder cancel would prevent the order from ever reading `returned`.
- Once no holding return is `requested` or `approved`, the result is only ever `returned` or `partially_returned` — an iteration over `ordered` decides which.
