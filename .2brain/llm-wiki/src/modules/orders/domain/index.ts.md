---
source: src/modules/orders/domain/index.ts
sha256: 8fd28d0de6505bf1e14720c34fdff19d2098771c7ce2a2cd705a40334aabebe0
generated_at: 2026-09-27T15:08:51.882941+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/index.ts

## Purpose

Selective barrel for the orders domain layer. It re-exports the public surface of the five domain sub-modules (totals, rules, lifecycle, tax, transfer-reference) so that consumers import from a single entry point while the layer remains guaranteed free of Express, Mongoose, and any tier-specific code. It intentionally omits certain symbols to prevent them from being treated as general-purpose utilities.

## Key elements

- **`sumLineItems`, `orderTotal`** (from `./totals`) — compute the order's line-item sum and final total.
- **`checkOrderLines`, `isShippedItem`, `isDigitalOnlyOrder`** (from `./rules`) — validate and classify order lines; `ShippableLineCandidate` type.
- **`canTransition`, `isPayable`, `stockCommitted`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`, `canOverrideTo`, `statusesOverridableInto`, `overridableTargetsFrom`** (from `./lifecycle`) — order-status transition and override logic; `OrderActor` type.
- **`orderTaxBreakdown`** (from `./tax`) — VAT breakdown derived from frozen lines; `OrderTaxBreakdown`, `LineTaxBreakdown`, `TaxableLineItem`, `TaxRateSummary` types.
- **`buildReference`, `parseReference`** (from `./transfer-reference`) — mint and parse the RF creditor reference for `bank_transfer` orders.

## Relationships

- **`./totals`, `./rules`, `./lifecycle`, `./tax`, `./transfer-reference`** — sole source modules for every re-export in this file; this file adds no logic of its own.
- **`src/modules/orders/index.ts`** — parent module barrel; imports from this file to surface the domain layer to the wider orders module.
- **`src/modules/orders/services/cancel.ts`, `override.ts`, `scope.ts`, `status.ts`** — service-layer consumers that import domain symbols through this barrel (e.g. `canTransition`, `orderActionsFor`, `isPayable`).
- **`src/modules/orders/emails.ts`** — sibling in the same module; does not import from this barrel but shares the domain contracts (types from `./tax`, `./lifecycle`).
- **`src/modules/orders/tests/unit/emails.test.ts`** — test file that exercises email rendering against domain outputs (totals, tax breakdown).

## Notes

- **Deliberate omissions are a design contract.** `toCents` is *not* re-exported so it cannot be mistaken for a shared utility; it is an internal detail of `sumLineItems` in `totals.ts`. Likewise `ORDER_LIFECYCLE` (the raw transition table) is hidden so callers must use the named predicates (`canTransition`, `isPayable`, etc.) rather than re-deriving state logic.
- **Adding a new export here is a public-API decision.** Any new `export` line makes the symbol visible to every tier that imports the orders module. If a helper is only needed by one sibling module, keep it local there.
- The module doc-block references `docs/theory/domain-layer.md` for the tiering rules this file enforces.
