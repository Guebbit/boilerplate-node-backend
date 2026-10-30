---
source: src/modules/shop/service.ts
sha256: 42fd4c7b024008807fa0b3b06ce798d0660e16bc62f304abf67f2db0d55df665
generated_at: 2026-10-29T05:52:27.700940+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/service.ts

## Purpose

Single reader surface for all shop-level configuration (country, timezone, identity, currency, shipping, returns). Every sibling module that needs a "which country", "where do returns go", or "what's the VAT jurisdiction" answer imports from here instead of reading `shopConfig` directly. Also composes the public `Shop` record returned by `GET /shop`.

## Key elements

- **`requiredValue(name, value)`** — internal guard that throws `ConfigError` when a config variable is `undefined`; the runtime backstop for the `NODE_ENV=test` case where boot-time manifest checks are skipped.
- **`shopCountry()`** — returns the shop's ISO-3166 country (the sole VAT jurisdiction; below the €10k distance-selling threshold).
- **`shopTimezone()`** — returns the canonical IANA zone name; drives year-numbered series and day-counting in reports.
- **`ShopIdentity`** (interface) — legal name, optional VAT/trade-register fields, address, contact details.
- **`shopIdentity()`** — assembles a `ShopIdentity` from config; optional fields are omitted (not set to `null`) when absent.
- **`returnAddress()`** — returns the configured return address, or falls back to the shop's legal address if the return config is incomplete (all-or-nothing: partial reads as absent).
- **`addressLine(address)`** — joins a `ShopAddress` into a single comma-separated line, skipping empty fields.
- **`returnPostagePayer()`** — `'consumer'` or `'shop'`; also drives the withdrawal-email wording.
- **`shipToCountries()`** — upper-cased ISO-3166 list; defaults to `[shopCountry()]` when unset.
- **`shopCurrency()`** — the single ISO-4217 code; frozen onto orders/payments at creation time.
- **`BACKORDER_PROMISE_DAYS`** — constant `30`; the statutory backorder window, not a runtime setting.
- **`getShop()`** — composes the full public `Shop` object (identity + currency + shipping + returns + `termsVersion` + backorder days). Excludes timezone and bank details.

## Relationships

- **`src/infrastructure/config/define.ts`** — imports `ConfigError` for the `requiredValue` guard.
- **`src/modules/account/index.ts`** — imports `termsVersion`, included in the `getShop()` response.
- **`src/modules/cart/services/checkout.ts`** — consumes `shipToCountries()` to reject (422) unshippable destinations; reads `returnPostagePayer()` for order confirmation.
- **`src/modules/orders/emails.ts`** — uses `returnPostagePayer()` and `returnAddress()` / `addressLine()` to render withdrawal and placed-order email body.
- **`src/modules/delivery/emails.ts`** — prints the return address via `returnAddress()` / `addressLine()`.
- **`src/modules/invoicing/services/issue-invoice.ts`** — reads `shopIdentity()` for the invoice seller block.
- **`src/modules/invoicing/services/numbering.ts`** — uses `shopTimezone()` to assign the correct calendar year to sequence numbers.
- **`src/modules/invoicing/tests/integration/issue-invoice.test.ts`** / **`issue-credit-note.test.ts`** — exercise the shop identity and currency values in integration assertions.
- **`src/modules/orders/controllers/get-orders-export.ts`** — references shop settings for exported order context.

## Notes

- **Test-env gap:** Boot-time manifest checks are skipped under `NODE_ENV=test`. Every `requiredValue` call is the only thing preventing a silent `undefined` from leaking into a legal notice or invoice. If a test suite forgets to set a `NODE_SHOP_*` variable, it gets a `ConfigError` at the first read.
- **`shipToCountries` defaulting:** When `NODE_SHIP_TO_COUNTRIES` is empty *and* `NODE_SHOP_COUNTRY` is also unset, the function returns `[]` — checkout would then refuse all address-requiring methods.
- **Partial return address:** The check requires *all four* of street/city/zip/country. A deployment that sets only a street and city will silently fall through to the legal address.
- **`ShopIdentity` optional fields:** Built with conditional spread (`...(vatNumber ? { vatNumber } : {})`), so the JSON representation has no `null` keys — only present keys.
- **Timezone must be named:** A fixed offset (e.g. `UTC+1`) is explicitly wrong; the zone must be an IANA name so DST transitions are respected for year-boundary sales.
