---
source: src/modules/shop/openapi.yaml
sha256: e09818ff6d7d8c913a58464ec280075a8e8ab4252e7fa07ee7ed8d50833dc27a
generated_at: 2026-11-08T08:20:40.336653+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract defining the single public read endpoint of the shop module: `GET /shop`. It documents the shop's immutable commerce settings (currency, ship-to countries, return address, postage payer, backorder promise, time zone) so API consumers and UI screens can discover the shop's identity without reading source.

## Key elements

- **`paths./shop.get`** (`operationId: getShop`) — returns the `Shop` object. No auth (`security: []`); treated as cheap, cacheable, and unchanged without a redeploy.
- **`Shop` schema** — required fields: `currency`, `minorUnits`, `shipToCountries`, `returnAddress`, `returnPostagePayer`, `backorderPromiseDays`, `timeZone`.
- **`ShopAddress` schema** — the return-destination address (street/city/zip/country, optional name).
- **`ReturnPostagePayer` schema** — enum `consumer | shop`; indicates who pays return postage.
- **`tags`** — single tag `Shop` (family: "Running the shop").
- **External `$ref`s** — `CurrencyCode` and `CountryCode` are pulled from `../../../shared/contracts/openapi.root.yaml`.

## Relationships

- **`src/modules/shop/module.ts`** — this YAML is the declarative contract *for* that module's HTTP surface; the module implements the `getShop` operation it specifies.
- **`src/modules/returns/module.ts`** — consumes the `returnAddress` and `returnPostagePayer` values exposed here (a return "freezes the value it was opened under," per the schema description).

## Notes

- `backorderPromiseDays` is documented as a legal constant (CRD Art. 18(1)), not a runtime setting — treat it as fixed per deployment.
- `minorUnits` exists so clients can build price inputs correctly; amounts *received* already carry their own precision, so clients must not re-apply it.
- Bank-transfer details are deliberately **excluded** from this endpoint; they travel on individual orders.
- The time zone is an IANA name (e.g. `Europe/Rome`) and date-like fields elsewhere in the system are plain calendar days on that zone — no client-side conversion is expected.
