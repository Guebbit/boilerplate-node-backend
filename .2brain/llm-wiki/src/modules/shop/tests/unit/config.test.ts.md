---
source: src/modules/shop/tests/unit/config.test.ts
sha256: 2b13ec0d0e7bddf5b7dc768e4071525fa0098bb96f2b1fa341b73627a36d23ef
generated_at: 2026-11-08T08:21:34.133907+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/tests/unit/config.test.ts

## Purpose

Unit tests for the shop module's environment-driven configuration: the functions in `service.ts` that read jurisdiction, timezone, phone, return address, postage payer, ship-to list, and currency from env variables, plus the boot-time gate those reads feed into. Verifies both the "valid baseline" and the specific failure/edge behavior of each variable.

## Key elements

- **`configure()`** — sets a fully-valid env (NODE_ENV=development, URL, country, timezone, operator identity) so each test can override exactly one variable.
- **`IDENTITY` / `COUNTRY`** — fixture objects holding the operator's legal name, street, city, zip, phone, and country.
- **`TOUCHED`** — the complete list of env vars this file may write; passed to `withoutEnvironmentInThisFile` so the test runner restores them after the file finishes.
- **`accountSliceOnly`** — a shallow copy of the account module with its `config` array trimmed to the first slice (operator identity), isolating the phone rule from token/OAuth checks.
- **`describe` blocks** — one per config concern: jurisdiction, timezone, shipToCountries, phone boot gate, account phone rule, traderPhone, returnAddress, returnPostagePayer, shopCurrency. Each asserts both the per-call read (e.g. `shopCountry()`) and the boot gate (`assertModuleConfig([shopModule], [])`).

## Relationships

- **`src/kernel/module-config.ts`** — provides `assertModuleConfig`, the boot-time validator the tests invoke to confirm which env variables gate module startup.
- **`src/modules/shop/module.ts`** — the module descriptor passed into `assertModuleConfig`; its `config` array declares the env rules under test.
- **`src/modules/shop/service.ts`** — source of every function under test (`shopCountry`, `shopTimezone`, `shipToCountries`, `traderPhone`, `returnAddress`, `returnPostagePayer`, `shopCurrency`).
- **`src/modules/account/module.ts` / `index.ts`** — imported to verify the *complementary* rule: the account module does **not** require `NODE_LEGAL_PHONE`, and `operatorIdentity` omits `phone` when unset.
- **`src/modules/account/services/operator-identity.ts`** — source of the `operatorIdentity` function checked in the "account phone rule" block.
- **`tests/support/environment.ts`** — provides `setEnvironment` (write a var) and `withoutEnvironmentInThisFile` (snapshot/restore all `TOUCHED` vars after the file).

## Notes

- **NODE_ENV gate:** Every test (via `configure()`) sets `NODE_ENV` to something other than `test`. The config gate in `assertModuleConfig` short-circuits under the test environment, so a suite that leaves `NODE_ENV=test` would silently pass without asserting anything.
- **Per-call vs. boot:** The file deliberately exercises both layers — reading a function directly (catches a bad value at call time) and calling `assertModuleConfig` (catches the same value at startup). A fix that only patches one layer will be caught here.
- **Partially-set return address:** Setting even one `NODE_RETURN_ADDRESS_*` variable without the full set is treated as "unset" and falls back to the operator's legal address — this is tested explicitly.
- **Currency validation:** `shopCurrency()` accepts any 3-letter ISO code at read time, but the boot gate rejects codes no provider would echo (e.g. `EURO`, `XYZ`). The tests pin both behaviors.
