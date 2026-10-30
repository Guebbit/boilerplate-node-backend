---
source: src/modules/shop/tests/unit/config.test.ts
sha256: 325eadaca8082fb2a52a1d4a6049039fc04d4e5c59c1f609f2159604c5e890a4
generated_at: 2026-10-29T05:52:52.068924+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/tests/unit/config.test.ts

## Purpose

Unit-tests the shop module's configuration layer: both the boot-time gate (`assertModuleConfig`) and the per-call reader functions (jurisdiction, timezone, identity, return address, postage payer, ship-to countries, currency). Verifies required-variable enforcement, value normalization (upper-casing, trimming, canonical timezone names), fallback behavior (return address → shop address), and sensible defaults (currency → EUR, postage payer → consumer).

## Key elements

- **`IDENTITY`** — const object with valid sample values for the six required shop-identity env vars (`NODE_SHOP_LEGAL_NAME`, `STREET`, `CITY`, `ZIP`, `EMAIL`, `PHONE`).
- **`IDENTITY_VARIABLES`** — typed array of `IDENTITY` keys, used by `it.each` to generate one "missing var" case per field.
- **`TOUCHED`** — exhaustive list of every env var the file mutates; passed to `withoutEnvironmentInThisFile` so the process environment is restored after the file runs.
- **`configure()`** — helper that sets a fully valid "development" environment; each test then overrides one variable to test the specific failure or behavior.
- **`describe` blocks** — one per config concern (jurisdiction gate, jurisdiction read, timezone, shipToCountries, identity gate, shopIdentity, returnAddress, returnPostagePayer, shopCurrency).

## Relationships

- **`src/kernel/module-config.ts`** — source of `assertModuleConfig`, the boot-time validator invoked with `[shopModule]` to exercise the gate.
- **`src/modules/shop/module.ts`** — exports `shopModule`, the module descriptor passed to `assertModuleConfig` so the gate checks shop-specific rules.
- **`src/modules/shop/service.ts`** — exports the seven reader functions under test (`shopCountry`, `shopTimezone`, `shipToCountries`, `shopIdentity`, `returnAddress`, `returnPostagePayer`, `shopCurrency`).
- **`tests/support/environment.ts`** — provides `setEnvironment` (mutate env for a case) and `withoutEnvironmentInThisFile` (register vars for post-file cleanup).

## Notes

- **`NODE_ENV` must be set away from `'test'` in every case.** The gate short-circuits under the test environment; a case that forgets this asserts nothing and passes silently. `configure()` handles this, but ad-hoc cases (e.g. `returnPostagePayer`, `shopCurrency`) set it independently.
- **Partially-set return address = unset.** If only some `NODE_RETURN_ADDRESS_*` vars are present, the reader falls back entirely to the shop address rather than returning a mixed object.
- **`shopIdentity` omits `vatNumber` when unset** — it is the only optional identity field and does not trigger a boot-gate failure.
- **Timezone validation rejects fixed offsets** (`+01:00`) at boot and normalizes to IANA canonical form (`europe/rome` → `Europe/Rome`) on read.
- **`shipToCountries`** upper-cases and trims each comma-separated entry; defaults to `[shopCountry]` when `NODE_SHIP_TO_COUNTRIES` is absent; returns `[]` when both are unset.
- **`shopCurrency`** reads `NODE_DEFAULT_CURRENCY` (the infrastructure-slice variable name, not a shop-prefixed one) and upper-cases the result.
