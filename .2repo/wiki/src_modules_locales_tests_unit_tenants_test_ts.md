# src/modules/locales/tests/unit/tenants.test.ts

## Purpose

Unit tests for the tenant registry in `../../tenants`. Because every reader is lazy (reads `process.env` on call), each test case sets the relevant environment variables itself, then asserts on the returned data. The suite locks in the demo pair as the floor, verifies env-driven overrides, extra-tenant parsing, and the frontend/backend/unknown classification predicates.

## Key elements

- **`beforeEach` / `afterEach` hooks** — Snapshot and restore the three env keys (`NODE_LOCALE_TENANT_BACKEND`, `NODE_LOCALE_TENANT_FRONTEND`, `NODE_LOCALE_TENANTS_EXTRA`) so no state leaks between tests or into other suites.
- **"defaults to the demo pair, the backend first"** — Asserts the zero-config output of `listTenants()` and the `backendTenant()` / `frontendTenant()` shortcuts.
- **"reads the two ids from the environment"** — Verifies that setting the two primary env vars replaces the demo pair.
- **"adds the extra frontends, labelled or not, and drops a duplicate"** — Exercises `NODE_LOCALE_TENANTS_EXTRA` parsing: comma-separated, optional `id=label` form, empty entries skipped, duplicates of an already-present tenant dropped.
- **"tells a frontend tenant from the backend one and from a stranger"** — Checks `frontendTenantIds()`, `isFrontendTenant()`, and `isKnownTenant()` against known and unknown ids.

## Relationships

- **`src/modules/locales/tenants.ts`** — Sole dependency under test. Imports `backendTenant`, `frontendTenant`, `frontendTenantIds`, `isFrontendTenant`, `isKnownTenant`, and `listTenants`. No other module is referenced.

## Notes

- The file's module doc comment calls out a real hazard: a leaked `NODE_LOCALE_TENANTS_EXTRA` could silently let an *unrelated contract test* accept a tenant that was never configured. The `afterEach` restore is the guard against that.
- The "floor" language in the header means the demo pair (`demo-be` / `demo-fe`) is the minimum guarantee — every reader must return at least that pair even with no env vars set.
- The extra-tenant parser is expected to treat a bare id (e.g. `kiosk`) as both id and label, and to ignore entries that duplicate an id already in the list.
