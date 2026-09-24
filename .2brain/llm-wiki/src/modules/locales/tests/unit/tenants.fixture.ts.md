---
source: src/modules/locales/tests/unit/tenants.fixture.ts
sha256: 57498b10da47fca45bf5ed3c59e71b7a1ebdc064e03b8c0f3ad88a0773425e7b
generated_at: 2026-09-23T18:54:49.921444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/tenants.fixture.ts

## Purpose

Test fixture that supplies the two demo tenant IDs used by unit and integration test suites. The IDs are read live from the locale registry (`tenants.ts`) rather than hardcoded, so a test can never drift from the values the service actually accepts.

## Key elements

- **`BACKEND`** — exported constant holding the demo backend tenant ID, obtained by calling `backendTenant()` at module load.
- **`FRONTEND`** — exported constant holding the demo frontend tenant ID, obtained by calling `frontendTenant()` at module load.
- Imports `backendTenant` and `frontendTenant` from `../../tenants` (i.e., `src/modules/locales/tenants.ts`).

## Relationships

- **`src/modules/locales/tenants.ts`** — source of the two factory functions this fixture calls. The fixture exists to avoid duplicating the literal IDs that function produces.
- **`src/modules/locales/tests/unit/service.test.ts`** — consumer of `BACKEND` / `FRONTEND` when writing rows under known tenant IDs.
- **`src/modules/locales/tests/integration/repository.test.ts`** — consumer of the same constants, ensuring unit and integration suites agree on which tenant rows to target.

## Notes

- The values are captured **at import time** (module-level `const` assignments). If `backendTenant()` or `frontendTenant()` ever became async or environment-dependent, this fixture would need to be refactored to a lazy accessor.
- The file intentionally lives under `tests/unit/` even though `repository.test.ts` (an integration test) also imports it — it is shared across test layers despite the `unit` directory placement.
