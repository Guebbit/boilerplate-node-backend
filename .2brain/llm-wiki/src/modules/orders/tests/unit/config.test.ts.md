---
source: src/modules/orders/tests/unit/config.test.ts
sha256: 9494413d59931d3ff9a12f7a145e6beacaadceb3ab3725e5076c62fadf72cdfd
generated_at: 2026-09-27T15:20:43.999676+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/config.test.ts

## Purpose

Unit-test suite for the orders module's runtime configuration readers (shop identity, bank-transfer payment settings, invoice cache TTL, and the order-frontend link template) and for the `assertRequiredConfig` boot gate as applied to the orders module. It verifies pure env-var reading, defaulting, formatting, and the demo-profile / test-env TTL override without booting the full application.

## Key elements

- **`TOUCHED`** — exhaustive list of every env var the suite touches; passed to `withoutEnvironmentInThisFile` so each case starts from a clean slate.
- **`configure()`** — helper that sets a minimal valid deployment (`NODE_ENV=development`, `NODE_URL`, `NODE_SHOP_COUNTRY=IT`) before individual cases break one thing.
- **`describe('the shop identity boot gate')`** — asserts `assertRequiredConfig([ordersModule])` throws without `NODE_SHOP_COUNTRY` and passes when the two optional identity fields are absent.
- **`describe('reading the identity')`** — confirms readers re-read env on every call and that empty-string values are returned as `undefined` (not `''`) so the invoice template omits the row.
- **`describe('shipToCountries')`** — covers the default (shop country alone), the empty case, and parsing/upper-casing/trimming of a comma-separated override.
- **`describe('bankTransferEnabled')` / beneficiary / IBAN / BIC / hold hours / max open** — verifies the two-key enablement rule, undefined defaults, configurable values, and the 168-h / 2-open defaults.
- **`describe('bankTransferIbanFriendly')`** — checks 4-char grouping and that pre-spaced input is re-grouped rather than double-spaced.
- **`describe('invoiceCacheTtlMinutes')`** — covers the 5-min default, env override, floor-at-0 for negative values, and the forced-0 under demo profile (`enableDemoProfile()`) or `NODE_ENV=test`.
- **`describe('orderFrontendLink')`** — validates the default template, the `NODE_FRONTEND_LINK_ORDER` override, and URL-encoding of the order id.

## Relationships

- **`src/modules/orders/config.ts`** — the module under test; all reader functions (`shopCountry`, `bankTransferIban`, `invoiceCacheTtlMinutes`, `orderFrontendLink`, etc.) are imported and exercised here.
- **`src/kernel/required-config.ts`** — provides `assertRequiredConfig`, the boot-gate entry point the suite drives to confirm the orders module's required fields are wired correctly.
- **`src/modules/orders/module.ts`** — exports `ordersModule`, passed to `assertRequiredConfig` to test the module's declared manifest requirements.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile`, which snapshots and restores every variable in `TOUCHED` around the file's execution.
- **`src/infrastructure/runtime/demo-profile.ts`** — provides `enableDemoProfile`, used to verify the demo-mode TTL override is honoured and then reset via `enableDemoProfile(false)` in `afterEach`.

## Notes

- **`NODE_ENV` gate:** every case that exercises the boot gate must set `NODE_ENV` away from `test` (via `configure()`); otherwise `assertRequiredConfig` short-circuits and the assertions are vacuous.
- **Empty-string ≠ absent:** optional identity readers (`shopVatNumber`, `shopLegalName`) deliberately map `''` → `undefined` so the invoice template skips the row entirely.
- **IBAN re-grouping:** `bankTransferIbanFriendly` strips all whitespace before re-grouping into 4-char blocks, so a pre-spaced env value does not produce doubled spaces.
- **Demo/test TTL is unconditional:** `invoiceCacheTtlMinutes` returns `0` under demo mode or `NODE_ENV=test` regardless of the env-var value; this keeps demo invoices and test runs out of the cache directory.
- **`orderFrontendLink` lives in the module, not infrastructure:** the template default and its `NODE_FRONTEND_LINK_ORDER` override are declared here (the D14 fix), while `infrastructure/http/frontend-link.ts` only resolves a template into a URL.
