---
source: src/modules/shop/tests/contract/api.contract.test.ts
sha256: f62a26998464cef20a471d86ae4d39c28bfcb26b284eeff461bf71429875ee1a
generated_at: 2026-11-08T08:21:21.963587+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the public `GET /shop` endpoint. They pin the response shape (currency, minor units, ship-to countries, return address, postage payer, backorder promise, time zone) and assert that operator identity and Terms version are **not** present — those belong to `GET /config`. The suite exists to catch accidental schema drift or over-exposure before it reaches consumers.

## Key elements

- **`describe('GET /shop')`** — the single test suite in this file; four cases.
- **"answers the currency, where it ships and where returns go, with no credential"** — asserts the full default response body (EUR, 2 minor units, IT-only shipping, the demo return address, consumer-pays postage, 30-day backorder, Europe/Rome).
- **"reports the configured currency, ship-to list and postage payer"** — uses `withEnvironmentOverrides` to switch to JPY / `it,fr` / shop-pays, verifying the endpoint honours env configuration and that JPY yields `minorUnits: 0`.
- **"carries no identity and no Terms version: those are GET /config"** — negative assertions that `legalName` and `termsVersion` are absent from the response.
- **"publishes the shop time zone, the calendar a promised day belongs to"** — overrides `NODE_SHOP_TIMEZONE` to `Asia/Tokyo` and checks the field is echoed.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`); provides global contract-test setup (e.g., matchers or conventions) before any `describe` runs.
- **`tests/support/http.ts`** — supplies the `api()` HTTP client used by every request in the suite.
- **`tests/support/environment.ts`** — exports `withEnvironmentOverrides`, which temporarily mutates `process.env` around a test callback so each case can exercise a different configuration without polluting others.

## Notes

- The default return address (`Guebbit Demo Shop Srl`, Via Roma 1, Milano) is seeded by `tests/support/setup-environment.ts`, not by this file. Changing the operator fixture will break the first assertion.
- `minorUnits` is currency-dependent: 2 for EUR, **0** for JPY. This is a domain rule, not an off-by-one; prices in a JPY-configured shop are whole yen.
- The file deliberately keeps `/shop` and `/config` boundaries explicit. If a new identity or terms field is added to the shop response, the negative test (case 3) is the guard that should be extended.
