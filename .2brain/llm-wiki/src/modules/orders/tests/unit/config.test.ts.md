---
source: src/modules/orders/tests/unit/config.test.ts
sha256: ad5fe49b9870dd0d23d32f8da15a78871344caeab3e47862f3112bb64f3e56fd
generated_at: 2026-09-23T19:13:08.034184+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/config.test.ts

## Purpose

Unit test suite for the orders module's deployment configuration. It verifies two concerns: (1) the boot-time gate that `assertRequiredConfig` enforces against the orders module manifest (shop identity is mandatory, VAT/legal name are optional), and (2) the pure environment-reader functions for shop identity, bank-transfer payment settings, and invoice cache TTL. Tests are driven through the real `assertRequiredConfig` entry point so the wiring itself is exercised, not just the manifest data.

## Key elements

- **`TOUCHED`** — const array listing every env var the gate reads; passed to `withoutEnvironmentInThisFile` so each test starts and ends with a clean environment.
- **`configure()`** — helper that sets a minimal valid deployment (`NODE_ENV=development`, `NODE_URL`, `NODE_SHOP_COUNTRY='IT'`) before each case mutates one thing.
- **`describe('the shop identity boot gate')`** — asserts `assertRequiredConfig([ordersModule])` throws when `NODE_SHOP_COUNTRY` is missing, and does not throw when the two optional fields are absent.
- **`describe('reading the identity')`** — confirms `shopCountry`, `shopVatNumber`, `shopLegalName` read per call (no caching) and that an empty string is returned as `undefined`, not `''`.
- **`describe('bankTransferEnabled')`** — verifies the AND-gate: `true` only when both beneficiary **and** IBAN are set.
- **`describe('bankTransferBeneficiary / bankTransferIban / bankTransferBic')`** — `undefined` when unset, configured value when set.
- **`describe('bankTransferIbanFriendly')`** — 4-character block grouping; re-groups an already-spaced IBAN rather than doubling spaces.
- **`describe('bankTransferHoldHours')`** — defaults to 168 (one week); reads `NODE_BANK_TRANSFER_HOLD_HOURS` when present.
- **`describe('bankTransferMaxOpenPerAccount')`** — defaults to 2; reads `NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT`.
- **`describe('invoiceCacheTtlMinutes')`** — defaults to 5; clamps negative values to the default (0 floor); returns 0 under demo profile or `NODE_ENV=test` regardless of the env var.

## Relationships

- **`src/kernel/required-config.ts`** — provides `assertRequiredConfig`, the function under test for the boot-gate cases.
- **`src/modules/orders/config.ts`** — source of every reader function exercised (`shopCountry`, `bankTransfer*`, `invoiceCacheTtlMinutes`, etc.).
- **`src/modules/orders/module.ts`** — the `ordersModule` object passed into `assertRequiredConfig` to validate the manifest wiring end-to-end.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile`, which snapshots and restores the listed env vars around the suite.
- **`src/infrastructure/runtime/demo-profile.ts`** — provides `enableDemoProfile`; used to assert that demo mode overrides the cache TTL to 0.

## Notes

- **`NODE_ENV` must leave `test`.** The gate short-circuits under the test environment, so the `configure()` helper explicitly sets `NODE_ENV=development`. A suite that omitted this would silently pass without asserting anything.
- **Empty string ≠ empty value.** Readers return `undefined` for `''` so the invoice template omits the row entirely; a literal `''` would render a blank line.
- **`invoiceCacheTtlMinutes` has a demo/test override.** Both `enableDemoProfile()` and `NODE_ENV=test` force the value to 0 (stream-from-buffer, no disk), taking precedence over any `NODE_INVOICE_CACHE_TTL_MINUTES` setting.
- **`afterEach` in the TTL block** calls `enableDemoProfile(false)` to reset the demo flag between cases.
