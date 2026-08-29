# src/modules/locales/tests/unit/tenants.fixture.ts

## Purpose

Provides shared tenant-id constants for unit tests in the locales module. It re-exports the demo-default tenant IDs obtained at runtime from the production registry (`../../tenants`) rather than hard-coding string literals, ensuring tests always reference the same values the service will accept.

## Key elements

- **`BACKEND`** – The backend tenant ID, resolved via `backendTenant()` at module-load time.
- **`FRONTEND`** – The frontend tenant ID, resolved via `frontendTenant()` at module-load time.

Both are plain `const` exports (no classes, no factory functions beyond the imported getters).

## Relationships

- **Imports from `src/modules/locales/tenants.ts`** – Calls `backendTenant()` and `frontendTenant()` to obtain the IDs at import time.
- **Consumed by `src/modules/locales/tests/unit/service.test.ts`** – Supplies the tenant IDs the service test writes rows under.
- **Consumed by `src/modules/locales/tests/integration/repository.test.ts`** – Supplies the same IDs for repository-level test setup.

## Notes

- The values are resolved **once at import time**. If `tenants.ts` ever changes to return different IDs per call (e.g., environment-dependent), this fixture will not pick up the change until the module is re-evaluated. Tests that need a fresh ID should call the registry directly instead.
- The naming (`BACKEND`, `FRONTEND`) is intentionally role-based, not environment-based, to match the demo scenario the locales suite models.
