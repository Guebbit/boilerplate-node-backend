---
source: src/modules/orders/config.ts
sha256: 58c66f8e842e97983ab6c42bab8ef3359f357d95b1c464c186cc404b02d1543f
generated_at: 2026-10-15T10:58:57.868073+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/config.ts

## Purpose

Central configuration for the orders module: the shop's legal identity (name, address, contact), return-shipment rules, bank-transfer payment details, operational limits (order size, retention, retry intervals), and the single frontend deep-link into the paired UI. All values are read per-call via getter functions so tests can vary them per case without re-imports; a deployment corrects a value with a restart.

## Key elements

- **`ordersConfig`** — The `defineConfig` manifest declaring every `NODE_*` variable, its validator, default, and constraints. The single source of truth for shape and boot-time requiredness.
- **`shopCountry()`** — Returns the shop's ISO-3166 country code (the only jurisdiction where VAT applies). Optional at runtime; required at boot.
- **`shopTimezone()`** — Returns the IANA time-zone name governing calendar-year series and day-counting. Throws `ConfigError` if unset (only possible under `NODE_ENV=test`).
- **`shopIdentity()`** — Returns a `ShopIdentity` object (legal name, address, email, phone, optional VAT number) for invoice seller blocks and CRD Art. 6(1)(b)–(c) notices.
- **`returnAddress()`** — Returns a `ReturnAddress`; falls back to the shop's legal address when the dedicated return fields are only partially set.
- **`returnPostagePayer()`** — Returns `'consumer'` (default) or `'shop'`; drives placed-order and withdrawal email wording per CRD Art. 14(1).
- **`shipToCountries()`** — Returns the upper-cased ISO-3166 list the deployment will ship to; defaults to the shop's own country alone.
- **`shopCurrency()`** — Delegates to `currencyConfig()` from infrastructure; the order-side door to the shared ISO-4217 code.
- **`bankTransferBeneficiary()` / `bankTransferIban()` / `bankTransferBic()`** — Individual getters; `undefined` means transfer is not offered.
- **`bankTransferIbanFriendly()`** — Strips whitespace and groups the IBAN into 4-character blocks for display to the customer.
- **`RETURN_POSTAGE_PAYERS` / `ReturnPostagePayer`** — Const array and derived union type for the postage-payer choice.
- **`requiredValue`** (module-private) — Guards against `undefined` on boot-required fields when `NODE_ENV=test` skips the manifest check.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig` and `ConfigError`; this file is a consumer of that DSL.
- **`src/infrastructure/config/fields.ts`** — Provides the `text`, `email`, `int`, `csv`, `choice`, `timeZone` validators used in the manifest.
- **`src/infrastructure/runtime/config.ts`** — Provides `currencyConfig`, re-exported here as `shopCurrency()`.
- **`src/infrastructure/http/frontend-link.ts`** — Provides `frontendLink`; this file is its one caller in the orders layer (infrastructure does not know `orders` exists).
- **`src/modules/invoicing/emails.ts` / `model.ts` / `services/numbering.ts`** — Consume `shopIdentity`, `shopTimezone`, and `shopCountry` for invoice rendering and year-numbered series.
- **`src/modules/orders/emails.ts`** — Consumes `shopIdentity`, `returnPostagePayer`, and `returnAddress` for placed-order and withdrawal emails.
- **`src/modules/cart/services/checkout.ts` / `view.ts`** — Read `shipToCountries` and bank-transfer getters to gate payment methods and display instructions.
- **`src/modules/delivery/services/start.ts` / `notify.ts`** — Read return-shipment and delivery-relevant config values.
- **`scenarios/flows/shop-history.ts`** — Reads shop identity and timezone for history/reporting context.
- **`src/modules/invoicing/tests/integration/issue-invoice.test.ts` / `issue-credit-note.test.ts`** — Vary config values per test case via the per-call read pattern.

## Notes

- The "per-call read, never capture at import" pattern is deliberate (set by `inventory/config.ts`): it lets each test case supply different values without module-cache resets.
- `NODE_RETURN_ADDRESS_*` fields are treated as all-or-nothing: if any of street/city/zip/country is missing, `returnAddress()` silently falls back to the shop's legal address rather than returning a partial result.
- `bankTransferIbanFriendly` intentionally does *not* use `ibantools`' `friendlyFormatIBAN`; it only does a 4-char chunk to keep `ibantools`' single-module ownership in `payments`.
- `NODE_SHIP_TO_COUNTRIES` defaults to `[shopCountry()]` only; a deployment must explicitly widen the list to enable cross-border shipping.
- `NODE_WITHDRAWAL_PERIOD_DAYS` has a hard minimum of 21 (CRD floor); `NODE_ORDER_PII_RETENTION_DAYS` defaults to 10 years.
