---
source: src/modules/delivery/tests/unit/rates.test.ts
source_sha256: 6f317c648d988b91a88a6d13c2a183bdef0b42f022ce52145b20e2ab60c72bf2
context_sha256: 634d5071e60b780804fd117761ac5bddb3de918fa411ff94f792e4b61c63271d
generated_at: 2026-11-22T05:05:24.741682+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/rates.test.ts

## Purpose
Unit tests for the shipping-rates domain module (`src/modules/delivery/domain/rates.ts`). The functions under test are pure and work over a static table, so the tests use no mocks and no database. The integration-level `service.test.ts` lives in `tests/integration/` because it needs a real database. The pricing rule does not, so it is tested here.

## Key elements
- **`SHIPPING_METHODS` (currency fit)**: for `JPY`, `EUR` and `KWD`, every method's `price` and `freeAbove` (default `'0'`) must satisfy `fitsCurrency`. This guards against rates with more decimal places than the currency's minor unit, which would be charged rounded.
- **`findShippingMethod`**: looks up a method by id. `express` returns the full object (price `'15.00'`, tracked, `maxWeight` 5000, `requiresAddress`). An unknown id such as `overnight` returns `undefined`.
- **`priceShipping`**:
  - `standard` costs `'5.00'` below the free threshold and `'0.00'` at 100.00 and above.
  - `express` is a flat `'15.00'` at any total.
  - `pickup` is `'0.00'`.
- **`methodFitsWeight`**:
  - With no weight range, any weight fits (`pickup`).
  - `maxWeight` is inclusive: 5000 fits for `express` and 5001 does not.
  - `minWeight` is inclusive: for an in-line `heavy` method with `minWeight: 1000`, 999 fails and 1000 passes.
- **Table-shape checks**: every method has a non-negative price, a boolean `tracked` flag and a boolean `requiresAddress` flag. Every method except `pickup` requires an address.
- **`cheapestStandardShipping`**: returns `'5.00'` for a 50.00 order and `'0.00'` for 100.00 and 150.00 orders. The comment says pickup is collection, not delivery.

## Relationships
- Imports `fitsCurrency` from `src/domain-primitives/money.ts` to check that table amounts are exactly representable in each currency.
- Imports `cheapestStandardShipping`, `findShippingMethod`, `priceShipping`, `methodFitsWeight` and `SHIPPING_METHODS` from `src/modules/delivery/domain/rates.ts`, which are the units under test.

## Notes
- The `minWeight` test builds its method in-line because no shipped method declares a `minWeight` today. The rule stays covered either way.
- The table-shape tests are canaries for typos in committed data. In-file comments say a missing `tracked` flag would surface as `undefined` where the door reads it to flag `awaitingTracking`. A missing `requiresAddress` flag would surface as `undefined` in checkout's shipping rule, which would then never refuse.
- Prices are decimal strings (e.g. `'5.00'`), and weights are plain numbers.
