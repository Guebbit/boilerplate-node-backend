---
source: src/modules/orders/services/index.ts
sha256: 08b2234a997fca39d7c26a3335fe609a70ab5b84d3399ab9770f7670d5e60374
generated_at: 2026-11-14T20:43:40.280866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/index.ts

## Purpose

Barrel module that aggregates every order-service function from ~20 sub-files and re-exports them as a single `orderService` object. It is the **only** import surface a controller or cross-module caller may use to reach Order business logic, enforcing the "one door in, one door out" layering rule described in `docs/theory/layers.md`.

## Key elements

- **`orderService`** (const object) — flat namespace of every public order operation: reads, writes, cancellation, fulfillment, timeline, retention/PII, stats, scope helpers, and action decorators. This is the sole value export consumed externally.
- **Type re-exports** — `OrderBrief`, `PlaceOrderInput`, `PlaceOrderLine`, `PlaceOrderOutcome`, `PlaceOrderShipping`, `CancelCause`, `OrderExport`, `PaidBucket`, `ProductTotal`, `CategoryTotal`, `ProductSeriesRead`, `AwaitingTransfers`, `PipelineRead`.
- **Config re-exports** — `orderFrontendLink`, `orderPagePath`, `withdrawalPeriodDays` pulled from `../config`. Re-exported here (rather than from `../index.ts`) to satisfy the barrel-allowed-sources rule.
- **Sub-module imports** — functions are sourced from `./read`, `./digest`, `./crud`, `./remove`, `./place`, `./notify`, `./cancel-mail`, `./purchase-hold`, `./retention`, `./scope`, `./actions`, `./snapshot`, `./reencrypt`, `./cancel`, `./status`, `./guarantee`, `./fulfillment`, `./override`, `./address`, `./export`, `./timeline`, `./stats`.

## Relationships

- **`src/modules/cart/services/checkout.ts` / `reorder.ts`** — depend on this module's `orderService` to perform order creation and post-creation recording during cart checkout flows.
- **`src/modules/cart/controllers/post-checkout.ts`** — consumes `orderService` for post-creation follow-up operations after a checkout is finalized.
- **`src/modules/delivery/services/digest.ts`** — imports from this module to build delivery-facing order summaries.
- **`src/modules/delivery/services/act.ts`, `deliver.ts`, `cut.ts`, `board.ts`, `announce.ts`, `ensure.ts`, `cancel-remainder.ts`** — invoke fulfillment, status, and stock-management functions exposed through `orderService`.
- **`src/modules/delivery/module.ts`** — delivery module registration; wires delivery services that in turn depend on `orderService`.
- **`src/modules/cart/tests/integration/checkout-stock-divergence.test.ts`, `stock.test.ts`** — integration tests that exercise `orderService` fulfillment and stock functions end-to-end.
- **`scenarios/flows/shop-history.ts`** — scripted flow that drives `orderService` read paths to assert shop-history behavior.

## Notes

- Controllers must **not** import the sub-files (`./place`, `./cancel`, etc.) directly; the barrel is the enforced boundary. Bypassing it breaks the layering contract.
- The `orderService` object is intentionally flat (no sub-namespaces), so callers use dot-access (`orderService.placeOrder`). Adding a nested structure here would be a breaking change for every consumer.
- Config getters are re-exported from this file rather than `../index.ts` due to the `local/barrel-allowed-sources` restriction; adding new config re-exports should follow the same pattern.
- `place.ts` is documented as the **only** write path for creating a new order; all other mutations go through `cancel`, `status`, `fulfillment`, `retention`, or `timeline` sub-modules.
