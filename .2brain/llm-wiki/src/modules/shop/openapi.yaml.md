---
source: src/modules/shop/openapi.yaml
source_sha256: b0feb22002c9b5f08edd31ce3890171b7b8a061c1d47e3cc1369ebf80cd0a1b2
context_sha256: b380e9ec77a16b0e4bb923145f8f8b9e218831058ac8aec92645e7a121cfda82
generated_at: 2026-11-22T07:47:19.273143+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (version `0.1.0`) for the `shop` module. It defines a single public endpoint that exposes the shop's commerce settings: currency, ship-to countries, return address, return postage payer, backorder promise and time zone.

## Key elements
- **Tag `Shop`** (family "Running the shop"): the tag this module's operations file under.
- **`GET /shop`** (`getShop`): public (`security: []`), annotated `x-cache: "max-age: 60"`. Returns a `Shop` as `application/json`. Settings only change on redeploy.
- **`Shop` schema**: closed object (`additionalProperties: false`) with all of these required:
  - `currency`: ISO-4217 code, the same currency `Product.currency` reports.
  - `minorUnits`: integer 0–4, the decimal places of the currency.
  - `shipToCountries`: array of country codes (`NODE_SHIP_TO_COUNTRIES`). Checkout refuses a method with `requiresAddress` when the address falls outside this list.
  - `returnAddress`: a `ShopAddress`.
  - `returnPostagePayer`: a `ReturnPostagePayer`.
  - `backorderPromiseDays`: integer ≥ 1. A legal value fixed by the server (CRD Art. 18(1)), not a setting.
  - `timeZone`: IANA zone name such as `Europe/Rome`. Promised days (`releaseDate`, `restockDate`, `agreedAt`, `expectedAt`) are days on this calendar and are sent as plain days.
- **`ShopAddress` schema**: closed object. Required fields are `street`, `city`, `zip` and `country`; `name` is optional. It is the configured return address (`NODE_RETURN_ADDRESS_*`), or the operator's postal address when none is fully set.
- **`ReturnPostagePayer` schema**: enum `consumer | shop`. The setting is `NODE_RETURN_POSTAGE_PAYER`, and a return freezes the value it was opened under.

## Relationships
- `src/modules/returns/openapi.yaml`: the returns module is the natural consumer of `ReturnPostagePayer` and `ShopAddress`, which describe where and at whose cost goods are returned. The description says a return freezes the payer value. This file does not reference the returns file directly.

## Notes
- The schemas are labeled as ones "only this module's paths reference", so they live here rather than in a shared location.
- `CountryCode` and `CurrencyCode` are not defined here. They are `$ref`'d from a shared root contract.
- The description points to `GET /config` (defined elsewhere) for the legal identity and Terms version.
- Bank-transfer details are deliberately not published here. They travel on each order.
- `currency` uses `allOf` around the `$ref` so a sibling `description` can be attached.
