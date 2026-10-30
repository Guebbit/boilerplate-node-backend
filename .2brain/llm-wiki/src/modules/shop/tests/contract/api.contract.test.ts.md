---
source: src/modules/shop/tests/contract/api.contract.test.ts
sha256: 2e081855f47082126e4211a32d49f3964a7d6d532c1e0c4ca02e766c6c095242
generated_at: 2026-10-29T05:52:37.865665+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the public `GET /shop` endpoint. They verify the exact public payload (seller identity, currency, ship-to countries, return address, terms version) and, just as importantly, that internal/operator data (time zone) is never leaked and that optional fields (VAT number, trade register, registration number) are omitted when unset.

## Key elements

- **`describe('GET /shop')`** — single suite containing seven `it` blocks:
  - *Default shape* — asserts `200` and an exact `toEqual` on the full body (legalName, address, email, phone, currency `EUR`, `shipToCountries: ['IT']`, `returnAddress`, `returnPostagePayer`, `termsVersion`, `backorderPromiseDays`).
  - *Configurable fields* — overrides `NODE_DEFAULT_CURRENCY`, `NODE_SHIP_TO_COUNTRIES`, `NODE_SHOP_VAT_NUMBER`, `NODE_RETURN_POSTAGE_PAYER` and asserts `toMatchObject`.
  - *Terms version* — overrides `NODE_TERMS_VERSION` to `'2026-10'` and checks it is echoed.
  - *Time-zone non-leakage* — asserts the serialized body never contains `'Europe/Rome'`.
  - *VAT absent* — sets `NODE_SHOP_VAT_NUMBER` to `''` and asserts the key is not present.
  - *Trade register / registration present* — sets both env vars and asserts they appear.
  - *Trade register / registration absent* — sets both to `''` and asserts both keys are missing.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — side-effect import; establishes shared contract-test conventions (matchers, helpers) before any test runs.
- **`tests/support/http.ts`** (`@tests/http`) — provides the `api()` factory used to build the HTTP client for every request in this file.
- **`tests/support/environment.ts`** (`@tests/environment`) — provides `withEnvironmentOverrides`, which temporarily sets process env vars for the duration of a test callback, then restores them.

## Notes

- The first test's expected body is populated by `tests/support/setup-environment.ts` (referenced in a code comment); changing that setup file will break the exact-equality assertion here.
- Optional fields (`vatNumber`, `tradeRegister`, `registrationNumber`) are tested for **absence** (not present in the key) when the corresponding env var is an empty string, rather than being `null` or `undefined` — the contract is "key omitted."
- The time-zone check searches the entire JSON string rather than a specific key, guarding against the value appearing in any nested field.
