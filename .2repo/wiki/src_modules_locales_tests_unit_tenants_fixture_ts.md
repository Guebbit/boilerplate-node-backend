# src/modules/locales/tests/unit/tenants.fixture.ts

## Purpose
A shared test fixture that resolves the two demo tenant IDs once, so unit and integration tests reference the same values the service actually accepts instead of hardcoding literals that could drift.

## Key elements
- **`BACKEND`** (exported const) — the resolved backend demo tenant ID, obtained by calling `backendTenant()`.
- **`FRONTEND`** (exported const) — the resolved frontend demo tenant ID, obtained by calling `frontendTenant()`.

## Relationships
- **`src/modules/locales/tenants.ts`** — source module; this file imports `backendTenant` and `frontendTenant` from it to produce the two exported constants.
- **`src/modules/locales/tests/unit/service.test.ts`** — consumes `BACKEND` / `FRONTEND` when seeding or asserting tenant-scoped rows in unit tests.
- **`src/modules/locales/tests/integration/repository.test.ts`** — consumes `BACKEND` / `FRONTEND` for the same purpose in integration tests.

## Notes
- Values are computed at module-load time (a single call to each factory), not lazily. If `backendTenant()` or `frontendTenant()` ever require async setup, this fixture will not accommodate it.
- The file lives under `tests/unit/` but is also imported by the integration test, so treat it as a shared fixture rather than a unit-only concern.
