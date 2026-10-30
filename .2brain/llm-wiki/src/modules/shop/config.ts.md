---
source: src/modules/shop/config.ts
sha256: f8d589384e40e659acff0d8986cd1fcf35f3f3fd65d91fc20587c5099a490c6c
generated_at: 2026-10-29T05:51:38.575784+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/config.ts

## Purpose

Declares the shop's identity and operational settings—legal name, address, contact, return address, ship-to countries, return-postage rule, and default currency. Every value is read at call time (not captured at import) so tests can vary them per case; a production change requires a restart.

## Key elements

- **`shopConfig`** — the single export. A `defineConfig` object named `'shop'` whose `shape` maps `NODE_*` env-var keys to validated fields.
  - *Required* (boot-time): `NODE_SHOP_COUNTRY`, `NODE_SHOP_TIMEZONE`, `NODE_SHOP_LEGAL_NAME`, `NODE_SHOP_STREET`, `NODE_SHOP_CITY`, `NODE_SHOP_ZIP`, `NODE_SHOP_EMAIL`, `NODE_SHOP_PHONE`.
  - *Optional*: `NODE_SHOP_VAT_NUMBER`, `NODE_SHOP_TRADE_REGISTER`, `NODE_SHOP_REGISTRATION_NUMBER`, all `NODE_RETURN_ADDRESS_*` fields.
  - *With defaults*: `NODE_RETURN_POSTAGE_PAYER` (defaults to `'consumer'`), `NODE_DEFAULT_CURRENCY` (defaults to `'EUR'`).
  - `NODE_SHIP_TO_COUNTRIES` — CSV list, upper-cased.
  - `NODE_RETURN_ADDRESS_COUNTRY` — upper-cased.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides the `defineConfig` factory used to build the config object.
- **`src/infrastructure/config/fields.ts`** — supplies the typed field validators (`text`, `email`, `timeZone`, `currency`, `csv`, `choice`) that describe each key's shape and constraints.
- **`src/types/index.ts`** — source of the `ReturnPostagePayer` enum whose values populate the `NODE_RETURN_POSTAGE_PAYER` choice field.
- **`src/modules/shop/module.ts`** — registers/exposes `shopConfig` within the shop module's dependency graph.
- **`src/modules/shop/service.ts`** — reads individual config values at call time to power shop-specific logic.
- Downstream consumers (per doc-comment): `orders`, `cart`, `delivery`, `invoicing`, `returns`, `products`, and `stats` all read these values; none own them.

## Notes

- The required address/contact fields exist for legal compliance (CRD Art. 6(1)(c)): invoices and withdrawal notices must print them.
- Bank-transfer instructions are deliberately **not** here—`payments` owns them.
- VAT rates are resolved by `products` and frozen by `orders`; they are not a shop setting.
- `NODE_SHIP_TO_COUNTRIES` is a single CSV string, not an array; consumers split it.
- The per-call read pattern means there is no cached singleton—do not capture the value at module top level.
