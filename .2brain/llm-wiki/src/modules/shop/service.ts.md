---
source: src/modules/shop/service.ts
source_sha256: 35247e6b7d7217b95252379b8792a655c6169b58c4caae04ab22e8e9aff4cfc7
context_sha256: 7f17cc9295c9615579e2f95d53e820976e49020dcd360e3ba8cbcc5119edfa86
generated_at: 2026-11-22T07:47:32.736426+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/service.ts

## Purpose
Central read-side accessor for the shop's settings. Values are read live from `shopConfig()` (and from the account module's operator identity), so sibling modules ask this file questions such as "which country do we charge VAT in?" or "where do returns go?". It also builds the body of the public `GET /shop` endpoint.

## Key elements
- `shopCountry()`: the operator's country (`operatorIdentity().country`). It is the only jurisdiction where VAT is charged.
- `shopTimezone()`: the IANA zone name from `NODE_SHOP_TIMEZONE`. Year-numbered series and report "days" follow this calendar.
- `shopDayOf(instant)`: converts a stored promise date to a shop-calendar `YYYY-MM-DD` string.
- `startOfShopDay(day)`: converts a `YYYY-MM-DD` day to the shop's midnight `Date`.
- `traderPhone()`: the operator's phone number, taken from `operatorIdentity().phone` (`NODE_LEGAL_PHONE`). It is printed on the withdrawal form.
- `returnAddress()`: the configured return address if street, city, zip and country are all set. Otherwise it falls back to the operator's legal address. `name` is included only when set.
- `addressLine(address)`: formats a `ShopAddress` on one line, skipping absent parts.
- `returnPostagePayer()`: `consumer` (default) or `shop`, from `NODE_RETURN_POSTAGE_PAYER`.
- `shipToCountries()`: the configured list, or just `[shopCountry()]` when none is set.
- `shopCurrency()`: the single ISO-4217 currency, from `NODE_DEFAULT_CURRENCY`.
- `BACKORDER_PROMISE_DAYS = 30`: a constant, not a setting. It is the promise for backorders with no restock date.
- `getShop()`: builds the public `Shop` record. It contains currency, `minorUnits` (via `minorUnitExponent`), `shipToCountries`, `returnAddress`, `returnPostagePayer`, `backorderPromiseDays` and `timeZone`.
- `requiredValue` (private): throws `ConfigError` for an unset required variable.

## Relationships
- `@infrastructure/config/define`: provides `ConfigError`, thrown by `requiredValue`.
- `@domain-primitives/money`: `minorUnitExponent` is used in `getShop`.
- `@domain-primitives/time`: `dayInZone` and `startOfDayInZone` back `shopDayOf` and `startOfShopDay`.
- `@modules/account` (`operatorIdentity`): supplies country, phone, legal name and the postal address fields. Boot-time validation of the operator identity lives there.
- `./config` (`shopConfig`): the source of every other value.
- The neighbor files in cart (checkout, view, backorder and preorder tests), delivery (controllers, emails, presenter, announce/ensure/process services) and account's operator-identity are listed in the graph as related. The file's own docs say that checkout uses the shipping-country list, that the payer drives the placed-order email and withdrawal acknowledgement wording, and that backorder promises are frozen into orders as `promisedAt`. Delivery's date handling is where the shop-day helpers are presumably used.

## Notes
- Under `NODE_ENV=test` the boot check is skipped. `shopTimezone` and `traderPhone` therefore throw `ConfigError` instead of returning `undefined`. `shopCountry` can throw for the same reason.
- `returnAddress()` deliberately treats a partly configured return address as unset and falls back to the legal address. It never returns a half-filled address.
- `shipToCountries` defaults to the operator's country only, so the single-country VAT assumption holds until a deployment widens the list.
- The shop is single-currency by design. The docs say a second currency needs a real design.
- `GET /shop` does not publish the legal identity, the Terms version (both belong to `GET /config`) or bank details (those travel per order).
