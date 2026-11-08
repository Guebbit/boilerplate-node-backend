---
source: src/modules/shop/service.ts
sha256: 501427e2c03e060d49d6ccbff088ef003ecae5a6bd701d278c9fad5e07273273
generated_at: 2026-11-08T08:21:11.283390+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/service.ts

## Purpose

Public read surface for the shop's operational settings. It wraps the raw `shopConfig` object and the operator-identity data into small, individually-importable readers (country, timezone, currency, return address, shipping list, etc.) that sibling modules call at request time. It also assembles the single `GET /shop` response body (`getShop`) so the client receives currency, shipping constraints, return logistics, and the backorder promise in one payload.

## Key elements

- **`requiredValue(name, value)`** (internal) – throws `ConfigError` if a config variable is `undefined`; the `NODE_ENV=test` backstop for missing boot-required variables.
- **`shopCountry()`** – returns the operator's ISO-3166 country; the sole VAT jurisdiction for this deployment.
- **`shopTimezone()`** – returns the IANA time-zone name that defines "a day" for calendar series and date boundaries.
- **`shopDayOf(instant: Date)`** – formats a stored promise `Date` into `YYYY-MM-DD` in the shop zone.
- **`startOfShopDay(day: string)`** – parses `YYYY-MM-DD` into the shop's midnight `Date` (storage direction).
- **`traderPhone()`** – returns the operator's phone number for the withdrawal-form "To" line.
- **`returnAddress()`** – returns the fully-configured return address, or the operator's legal address if any of street/city/zip/country is missing.
- **`addressLine(address)`** – joins present fields of a `ShopAddress` into a single comma-separated string for email/print use.
- **`returnPostagePayer()`** – `consumer` (default, CRD Art. 14(1)) or `shop`; also drives email wording.
- **`shipToCountries()`** – the list of ISO-3166 codes checkout will accept; defaults to `[shopCountry()]` when unset.
- **`shopCurrency()`** – the single ISO-4217 code this deployment trades in.
- **`BACKORDER_PROMISE_DAYS`** – constant `30`; the legal backorder window frozen onto orders (CRD Art. 18(1)).
- **`getShop()`** – assembles the full `Shop` record (currency, minor units, ship-to list, return address, postage payer, backorder days, time zone) for `GET /shop`.

## Relationships

- **`src/infrastructure/config/define.ts`** – provides `ConfigError`, thrown by `requiredValue` when a variable is missing.
- **`src/domain-primitives/money.ts`** – provides `minorUnitExponent`, used by `getShop()` to compute the `minorUnits` field.
- **`src/domain-primitives/time.ts`** – provides `dayInZone` / `startOfDayInZone`, the engine behind `shopDayOf` and `startOfShopDay`.
- **`src/modules/account/index.ts` / `operator-identity.ts`** – provides `operatorIdentity()`; this file reads `.country`, `.phone`, and the legal address fields from it.
- **`src/modules/cart/services/checkout.ts`** – consumes `shipToCountries()` to reject (422) shipping methods whose resolved address is outside the allowed set.
- **`src/modules/cart/services/view.ts`** – reads individual shop readers (e.g. `shopCurrency`, `BACKORDER_PROMISE_DAYS`) to render cart/summary screens.
- **`src/modules/delivery/emails.ts` / `services/announce.ts`** – consume `returnPostagePayer` (wording), `traderPhone` (recipient line), and `addressLine` / `returnAddress` (print the shop address).
- **`src/modules/delivery/presenter.ts` / `services/ensure.ts` / `services/process.ts`** – read shop settings (timezone, return address, ship-to list) when computing or validating delivery state.
- **`src/modules/delivery/controllers/get-date-impact.ts`** – uses `shopTimezone` / `shopDayOf` to resolve date-impact calculations in the shop calendar.
- **`src/modules/cart/tests/integration/backorder.test.ts` / `preorder.test.ts`** – integration suites that exercise `BACKORDER_PROMISE_DAYS` and the promise-date round-trip through `shopDayOf` / `startOfShopDay`.

## Notes

- Every reader that can throw does so only when `NODE_ENV=test` and a variable was never set; in production the boot-time check in `./config` guarantees presence, so the `ConfigError` path is a test-hygiene guard.
- `returnAddress` treats a *partially* configured address as absent — all four of street/city/zip/country must be present, otherwise it falls back wholesale to the legal address. A "Via Roma," with a blank city is worse than the legal fallback.
- `BACKORDER_PROMISE_DAYS` is a **hardcoded constant**, not a config variable. Changing it requires a code edit, not a deploy-config change.
- `getShop()` is intentionally the *only* place that bundles all fields; individual readers exist so a module that needs just `shopCurrency` doesn't pull in address logic. The legal identity and Terms version are deliberately excluded (they live on `GET /config`).
- `shopConfig` (imported from `./config`) is read on every call — there is no module-level cache. Each reader re-evaluates the config object at invocation time.
