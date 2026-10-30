---
source: src/modules/delivery/tests/unit/lost.test.ts
sha256: b461d0ed49e1a75923ef4509e9b62c046d2d31ff653e9b44484b39175f144f6c
generated_at: 2026-10-29T03:49:30.796205+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/lost.test.ts

## Purpose

Unit tests for the pure domain arithmetic that models a lost parcel: how a loss rewrites the origin fulfillment order's lines, when the parcel may be restored (all-or-nothing), what the restoration puts back, and how the owed-units promise date is computed. The file exists to pin down the invariants of these transformations without involving services, I/O, or mocking.

## Key elements

- **Test helpers** — `line()`, `shipment()`, `origin()`, `owedOrder()` build minimal `FulfillmentLine`, `LostShipmentFacts`, and `RestorableFulfillmentOrder` fixtures with sensible defaults (zero shipped/cancelled).
- **`describe('withLoss')`** — verifies loss subtracts shipped and owed quantities, leaves untouched lines alone, drops fully-owed lines (order reads `closed`, not `cancelled`), and floors shipped at zero.
- **`describe('planRestoration')`** — confirms restoration is allowed only when the origin line is still open and every owed unit is unshipped/uncancelled; aggregates owed units across multiple split-off orders; returns `undefined` on any violation (shipped, cancelled, missing origin, wrong shipment).
- **`describe('withRestoration')`** — confirms the inverse: re-ships lost units, re-attaches owed units to the origin line, restores a dropped line using the shipment's title, and round-trips exactly with `withLoss`.
- **`describe('summarize with a lost shipment')`** — asserts a lost shipment counts as *shipped* but not as *undelivered*.
- **`describe('owedDateOf')`** — checks the promise-date logic: latest future restock date wins, missing/past dates fall back to a default (30 days), and `defaulted` flag is set accordingly.

## Relationships

- **`src/modules/delivery/domain/lost.ts`** — source of `withLoss`, `planRestoration`, `withRestoration`, `owedDateOf`, `statusOfLines`; this file tests those functions directly.
- **`src/modules/delivery/domain/index.ts`** — barrel re-export through which the test imports the domain functions and types.
- **`src/modules/delivery/domain/fulfillment.ts`** — defines `FulfillmentLine`, `RestorableFulfillmentOrder`, `LostShipmentFacts`, and `summarize` used by the tests.
- **`src/modules/delivery/services/lost.ts`** — service layer that orchestrates these domain calls; this test deliberately stops at the domain boundary and does not exercise the service.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — sibling unit test covering the broader fulfillment-order lifecycle; shares the same domain imports and fixture style.
- **`tests/unit/scenarios/webhook-sink.test.ts`** — scenario-level test that may drive a lost-parcel flow end-to-end; these unit tests cover the pure arithmetic that flow depends on.

## Notes

- All tests are synchronous and allocation-free of mocks — the domain is pure, so no `jest.mock` or fake timers are needed.
- `owedDateOf` tests use a fixed reference date (`2026-10-26`) and a `DAY` millisecond constant rather than `jest.useFakeTimers`, keeping the assertions self-contained.
- The `withRestoration` "undoes withLoss exactly" test is the key invariant: applying loss then restoration must be a no-op on the line array. Any change to either function's shape will break this round-trip.
- `planRestoration` returning `undefined` (not throwing) is the refusal contract; tests assert `.toBeUndefined()` rather than expecting an exception.
