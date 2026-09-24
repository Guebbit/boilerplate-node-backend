---
source: src/modules/orders/domain/index.ts
sha256: 8e4a1ff034a25b531a8417c29766abe5772562b9f5eb9ae6da0a4d9adda2bde8
generated_at: 2026-09-23T19:01:18.486169+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/index.ts

## Purpose

Curated barrel for the orders domain layer. It re-exports the public, pure-rule API (totals, rules, lifecycle, tax, transfer-reference) so that consumers import from a single entry point without reaching into individual module files. It intentionally withholds internal helpers to keep the public surface minimal.

## Key elements

- **`sumLineItems`, `orderTotal`** — re-exported from `totals.ts`; compute order totals from line items.
- **`checkOrderLines`** — re-exported from `rules.ts`; validates order line items.
- **`canTransition`, `isPayable`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`, `canOverrideTo`, `statusesOverridableInto`** — re-exported from `lifecycle.ts`; query the order state machine for transitions, payability, and override permissions.
- **`OrderActor`** (type) — re-exported from `lifecycle.ts`; identifies the actor (customer, admin, etc.) performing a transition.
- **`orderTaxBreakdown`** — re-exported from `tax.ts`; computes the VAT breakdown for an order's frozen lines.
- **`OrderTaxBreakdown`, `LineTaxBreakdown`, `TaxableLineItem`, `TaxRateSummary`** (types) — re-exported from `tax.ts`; shapes for the tax breakdown result.
- **`buildReference`, `parseReference`** — re-exported from `transfer-reference.ts`; mint and parse the RF creditor reference used for `bank_transfer` orders.

## Relationships

- **Imports from (re-exports):** `./totals`, `./rules`, `./lifecycle`, `./tax`, `./transfer-reference` — each provides one or more functions/types surfaced through this barrel.
- **Consumed by:** `src/modules/orders/index.ts` (module-level barrel), the service files (`cancel.ts`, `crud.ts`, `override.ts`, `scope.ts`, `status.ts`), `src/modules/orders/emails.ts`, and `src/modules/orders/tests/unit/emails.test.ts` — all import the domain API through this file rather than reaching into sub-modules directly.

## Notes

- **`toCents` is deliberately not exported.** It is an internal helper used only by `sumLineItems`; exposing it would imply it is a general-purpose rule other modules may call.
- **`ORDER_LIFECYCLE` is deliberately not exported.** The raw table should never be read directly by callers; the named lifecycle functions (`canTransition`, `statusesReachableFrom`, etc.) are the intended interface.
- The file's doc-comment explicitly states the layer boundary: no Express, no Mongoose, no DB. Anything requiring I/O belongs in the services tier, not here.
