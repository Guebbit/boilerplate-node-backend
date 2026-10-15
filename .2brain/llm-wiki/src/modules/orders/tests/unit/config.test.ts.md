---
source: src/modules/orders/tests/unit/config.test.ts
sha256: d0a135664e39ec3dd4f4542c97323b37e154f49524c1febe6a20816e847528dc
generated_at: 2026-10-15T11:18:58.283991+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/config.test.ts

## Purpose

Unit tests for the orders module's deployment-config readers and its boot-time validation gate. Verifies that `assertModuleConfig` enforces required env vars (shop country, timezone, identity fields, withdrawal period) and that each individual reader (`shopCountry`, `bankTransferIbanFriendly`, `maxAdminOrderLines`, etc.) behaves correctly against a known-good environment.

## Key elements

- **`configure()`** — helper that sets a fully valid environment (country, timezone, identity, URL) so each `it` can mutate exactly one variable.
- **`TOUCHED`** — the complete list of env vars the suite reads or writes; passed to `withoutEnvironmentInThisFile` so no test leaks state into the next.
- **`IDENTITY` / `IDENTITY_VARIABLES`** — the six required shop-identity variables and their key names, used by a parameterised `it.each` boot-gate test.
- **Boot-gate describes** (`shop jurisdiction`, `shop time zone`, `shop identity`, `withdrawal period`) — call `assertModuleConfig([ordersModule], [])` and assert the thrown message names the missing/invalid variable.
- **Reader describes** (`shipToCountries`, `bankTransfer*`, `admin order limits`, `orderFrontendLink`, `shopIdentity`, `withdrawalPeriodDays`) — exercise the individual getters from `../../config` against specific env values, including edge cases (IBAN re-grouping, ceiling clamp, timezone canonicalisation, URL-encoding of order id).
- **`withoutEnvironmentInThisFile(TOUCHED)`** — top-level call that clears all touched vars before the suite and restores them after, preventing cross-file pollution.

## Relationships

- **`src/kernel/module-config.ts`** — exports `assertModuleConfig`, the boot-time validator this suite drives to confirm the orders module's required vars are enforced.
- **`src/modules/orders/config.ts`** — the module under test; every reader and constant (`bankTransferIbanFriendly`, `ADMIN_ORDER_LINES_CEILING`, `shopIdentity`, …) is imported from here.
- **`src/modules/orders/module.ts`** — the module definition passed as the argument to `assertModuleConfig`; its declared manifest (required vars, validation rules) is what the gate checks.
- **`tests/support/environment.ts`** — provides `setEnvironment` (per-case env mutation) and `withoutEnvironmentInThisFile` (suite-level isolation of the `TOUCHED` list).

## Notes

- **`NODE_ENV` gate:** `assertModuleConfig` short-circuits entirely when `NODE_ENV === 'test'`. Every boot-gate test therefore calls `configure()` first (which sets `NODE_ENV: 'development'`); a test that forgets this would silently pass with zero assertions.
- **Per-call reads:** readers like `shopCountry()` and `shopTimezone()` read the env var at call time, not at module load. The suite verifies this by mutating the var *after* import and expecting the new value.
- **Ceiling clamp:** `maxAdminOrderLines` / `maxAdminOrderLineQuantity` silently cap at `ADMIN_ORDER_LINES_CEILING` / `ADMIN_ORDER_LINE_QUANTITY_CEILING` even if the env var exceeds them; a value below 1 throws.
- **IBAN friendly formatting:** `bankTransferIbanFriendly` strips existing spaces before re-grouping into 4-char blocks, so a pre-spaced input does not double-space.
- **Timezone canonicalisation:** the reader normalises to IANA form (e.g. `europe/rome` → `Europe/Rome`) and rejects fixed-offset strings like `+01:00` at boot.
- **`orderFrontendLink` is module-local (D14):** the default template and its `NODE_FRONTEND_LINK_ORDER` override live in this module's config, not in `infrastructure/http/frontend-link.ts`, which only resolves an already-resolved template into a URL.
