---
source: src/modules/shop/tests/contract/api.contract.test.ts
source_sha256: f62a26998464cef20a471d86ae4d39c28bfcb26b284eeff461bf71429875ee1a
context_sha256: 66f1e97b8be9199ca68b108e580e453ecbd192d41dea1eb22a5624bce09fd1d5
generated_at: 2026-11-22T07:47:38.369799+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the public `GET /shop` endpoint. They check that it returns the shop's currency, ship-to countries, return address, postage payer, backorder promise and time zone, and that it does not return the operator's identity or the Terms version, which belong to `GET /config`.

## Key elements
- **Default response test**: calls `GET /shop` with no credential. Expects status 200 and an exact body:
  - `currency` `EUR` and `minorUnits` 2
  - `shipToCountries` `['IT']`
  - `returnAddress`: Guebbit Demo Shop Srl, Via Roma 1, Milano, 20100, IT
  - `returnPostagePayer` `consumer`
  - `backorderPromiseDays` 30
  - `timeZone` `Europe/Rome`
- **Configured values test**: overrides `NODE_DEFAULT_CURRENCY=JPY`, `NODE_SHIP_TO_COUNTRIES='it,fr'` and `NODE_RETURN_POSTAGE_PAYER=shop`. Expects `currency` `JPY`, `minorUnits` 0 (whole yen), `shipToCountries` `['IT','FR']` (the lowercase input comes back uppercased) and `returnPostagePayer` `shop`.
- **No identity test**: the body has no `legalName` and no `termsVersion` property.
- **Time zone test**: overrides `NODE_SHOP_TIMEZONE=Asia/Tokyo` and expects `timeZone` `Asia/Tokyo`.

## Relationships
- `@tests/contract` is imported only for its side effects. It is presumably the contract-suite setup in `tests/support/contract.ts`.
- `@tests/http` provides `api()`, which issues the `GET /shop` requests (`tests/support/http.ts`).
- `@tests/environment` provides `withEnvironmentOverrides(overrides, fn)`, which runs a callback with temporary `NODE_*` environment values (`tests/support/environment.ts`).

## Notes
- The default-case expectations depend on the operator set up by `tests/support/setup-environment.ts`. The operator's address is the fallback return address.
- Override tests return the `withEnvironmentOverrides` promise, so the overrides stay in effect for the whole async callback.
