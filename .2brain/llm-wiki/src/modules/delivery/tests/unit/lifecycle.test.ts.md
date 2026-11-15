---
source: src/modules/delivery/tests/unit/lifecycle.test.ts
sha256: f3647e2c03579eb85c62f18472ecc934ecd0dfbbce6a1523c6a9db01384e0d79
generated_at: 2026-11-14T19:55:13.801225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/lifecycle.test.ts

## Purpose

Unit test suite for the `shipmentLifecycle` state machine. Verifies the full transition table (valid events per status), event targets, the initial state, and that `defineLifecycle` enforces its contract by rejecting unknown statuses.

## Key elements

- **`describe('shipmentLifecycle')`** — the single test block; no helpers or fixtures are defined locally.
- **`eventsFrom` assertions** — confirm `shipped → ['deliver','lose']`, `lost → ['find']`, `delivered → []` (terminal).
- **`toOf` assertions** — pin each event to its target status (`deliver → delivered`, `lose → lost`, `find → delivered`).
- **`initial` assertion** — locks the starting state to `ShipmentStatus.shipped`.
- **Contract-violation test** — builds a partial status enum (omitting `lost`) and expects `defineLifecycle` to throw a `/unknown "lost"/` error, guarding against silent drift between the enum and the transition table.

## Relationships

- **`src/types/index.ts`** — imports `ShipmentStatus`, the enum whose members define the full status space.
- **`src/modules/delivery/domain/index.ts`** — the `../../domain` import resolves here; supplies the two objects under test: `SHIPMENT_EVENTS` and `shipmentLifecycle`.
- **`src/modules/delivery/domain/lifecycle.ts`** — the module that actually defines `shipmentLifecycle` and `SHIPMENT_EVENTS` (re-exported through the domain index).
- **`src/domain-primitives/lifecycle.ts`** — imports `defineLifecycle`; exercised only in the final "refuses to load" test to verify the builder's input validation.

## Notes

- The `find` event routes `lost → delivered`, not back to `shipped`. This is intentional per the test assertions but easy to misread.
- The contract-violation test does not mock anything; it calls the real `defineLifecycle` with a deliberately incomplete enum, making it the closest thing to an integration assertion in an otherwise pure unit file.
- No async tests, no setup/teardown, no snapshots — all expectations are synchronous `toEqual`/`toBe`/`toThrow` calls.
