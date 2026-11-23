---
source: src/modules/shop/config.ts
source_sha256: 99c83e4e2fd6c6c9f6ccde3794a946ad6187178ae50a72a07876a250326b0013
context_sha256: c98affcf966fe31ed98e1fe56118d3b55c276f6aa7dfa131f5a455f337c76434
generated_at: 2026-11-22T07:46:42.944834+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/config.ts

## Purpose
Declares the shop module's own settings: its time zone, the return address and who pays return postage, the countries it ships to, and its single trading currency. Values are read per call rather than captured at import (the pattern set by `src/modules/inventory/config.ts`), so tests can vary them per case. A deployment changes one by restarting.

## Key elements
- `shopConfig` — the exported config slice, built with `defineConfig({ name: 'shop', check, shape })`. Its shape contains these environment variables:
  - `NODE_SHOP_TIMEZONE` — `timeZone`, required with `minLength: 1`.
  - `NODE_RETURN_ADDRESS_NAME` — plain `text()` field.
  - `NODE_RETURN_ADDRESS_COUNTRY` — `country()`.
  - `NODE_RETURN_POSTAGE_PAYER` — `choice` over the values of `ReturnPostagePayer`, default `'consumer'`.
  - `NODE_SHIP_TO_COUNTRIES` — `countries()`.
  - `NODE_DEFAULT_CURRENCY` — `currency`, default `'EUR'`.
  - Further return-address fields (street, city, zip) are also declared as plain `text()` fields.
- `phoneCheck` — module-private boot check. It returns `['NODE_LEGAL_PHONE is required with the shop']` when `environment.NODE_LEGAL_PHONE` is missing or blank, and an empty array otherwise. It ignores the parsed config argument.

## Relationships
- `src/infrastructure/config/define.ts` — supplies `defineConfig`, which turns the name, check and shape into the config slice.
- `src/infrastructure/config/fields.ts` — supplies the field builders (`choice`, `countries`, `country`, `currency`, `text`, `timeZone`).
- `src/infrastructure/config/store.ts` — supplies the `Environment` type used by `phoneCheck`.
- `src/types/index.ts` — supplies the `ReturnPostagePayer` enum behind the postage-payer choices.
- `src/modules/shop/module.ts` and `src/modules/shop/service.ts` — neighbors in the shop module. This file's content doesn't show how they consume `shopConfig`.

## Notes
- The legal identity (`NODE_LEGAL_*`) belongs to the `account` module. The shop only reads it and requires the optional phone at boot. The phone requirement is a legal one: distance traders must state a telephone number (CRD Art. 6(1)(c)), and the withdrawal form's "To" row prints it.
- Bank transfer settings live in `payments`, which renders `transferInstructions`.
- VAT rates live in `products`. `orders` only freezes the resulting number.
- The file's header comment points to the "configuration" section of the shop module documentation.
