---
source: src/modules/shop/tests/unit/config.test.ts
source_sha256: 2b13ec0d0e7bddf5b7dc768e4071525fa0098bb96f2b1fa341b73627a36d23ef
context_sha256: 21a27364bdde9a4efde5ce21c643792a9e15ba67285079e42894a5d034af3cde
generated_at: 2026-11-22T07:47:55.453572+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/tests/unit/config.test.ts

## Purpose
Unit tests for the shop module's own settings, all of which are pure environment reads: VAT/jurisdiction country, time zone, operator phone, return address (with fallback to the operator's), return postage payer, ship-to countries and currency. Boot-time rules are exercised through `assertModuleConfig` rather than by inspecting the manifest, so the module's wiring is tested too.

## Key elements
- `IDENTITY` / `COUNTRY` / `IDENTITY_VARIABLES`: valid `NODE_LEGAL_*` values (name, street, city, zip, phone) and `NODE_LEGAL_COUNTRY: 'IT'`.
- `TOUCHED`: every env variable the gate reads. It is passed to `withoutEnvironmentInThisFile` so they are cleared before each case and restored after the file.
- `configure()`: sets a fully valid deployment (`NODE_ENV=development`, `NODE_URL`, country, `NODE_SHOP_TIMEZONE=Europe/Rome`, identity). Each case then breaks one thing.
- `accountSliceOnly`: the account module with only the first of its three config slices.
- Test groups:
  - `shopCountry`: re-read on every call.
  - `shopTimezone`: boot refuses a missing value or a fixed offset such as `+01:00`. The canonical name is returned, so `europe/rome` becomes `Europe/Rome`. Reading it unset throws.
  - `shipToCountries`: defaults to the shop country alone. Values are upper-cased, and configured lists are also trimmed. A configured list takes precedence over the shop country.
  - Shop phone boot gate: boot fails without `NODE_LEGAL_PHONE` when the shop module is present, and is not asked for when the module is absent.
  - Account phone rule: boots without a phone, and `operatorIdentity()` then has no `phone` property.
  - `traderPhone`: returns the phone, and throws a `ConfigError` when it is unset.
  - `returnAddress`: falls back to the shop address, uses a fully configured address with the country upper-cased, and treats a partly set address as unset.
  - `returnPostagePayer`: defaults to `consumer`, accepts `shop`, and throws on any other value.
  - `shopCurrency`: defaults to `EUR`, reads `NODE_DEFAULT_CURRENCY`, and upper-cases it. Boot refuses `EURO` and `XYZ`.

## Relationships
- `@kernel/module-config` (`src/kernel/module-config.ts`): supplies `assertModuleConfig`, which is called with `[shopModule]`, `[accountSliceOnly]` or `[]`.
- `src/modules/shop/module.ts`: the shop module manifest whose config checks are exercised.
- `src/modules/shop/service.ts`: provides the readers under test (`shopCountry`, `shopTimezone`, `shipToCountries`, `traderPhone`, `returnAddress`, `returnPostagePayer`, `shopCurrency`).
- `src/modules/account/module.ts`: its config slice is trimmed to build `accountSliceOnly`.
- `src/modules/account/index.ts` and `src/modules/account/services/operator-identity.ts`: `operatorIdentity` is imported from the account module's index and checked to omit `phone` when none is set.
- `tests/support/environment.ts` (`@tests/environment`): provides `withoutEnvironmentInThisFile` and `setEnvironment`.

## Notes
- Every case that goes through the boot gate sets `NODE_ENV` away from `test`, because the gate short-circuits under the test environment and the assertions would otherwise check nothing. Cases that call the readers directly (the postage payer and currency read cases) skip `configure()`.
- The phone requirement is split. The shop module requires the phone (a distance trader must state a telephone number), while the account module only requires an operator and does not.
- `accountSliceOnly` relies on the account module's phone-relevant config being its first slice (`slice(0, 1)`). The other two slices are the token and OAuth secrets.
