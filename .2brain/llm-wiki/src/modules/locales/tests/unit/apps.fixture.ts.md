---
source: src/modules/locales/tests/unit/apps.fixture.ts
sha256: cd387de8b7c27036fd2a000ba6646c0e9b2b699d114d8899f3d71699c3007136
generated_at: 2026-11-08T06:28:58.062516+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/apps.fixture.ts

## Purpose

Test fixture that exposes the two demo app IDs (backend and frontend) used across the locales test suite. The IDs are obtained by calling the registry functions in `apps.ts` rather than being spelled out as string literals, so tests always operate on values the service actually accepts and cannot silently drift if the registry changes.

## Key elements

- **`BACKEND`** – `export const`; the demo backend app ID, sourced from `backendApp()`.
- **`FRONTEND`** – `export const`; the demo frontend app ID, sourced from `frontendApp()`.

No functions or classes are defined; the file is a pure re-export of two values.

## Relationships

- **`src/modules/locales/apps.ts`** – Provides the `backendApp` and `frontendApp` factory functions that this file calls at import time to obtain the IDs.
- **`src/modules/locales/tests/unit/service.test.ts`** – Consumes `BACKEND` / `FRONTEND` as the app IDs under which test rows are written and queried.
- **`src/modules/locales/tests/integration/repository.test.ts`** – Consumes the same IDs to seed and assert repository-level data.
- **`src/modules/locales/tests/integration/update-audit.test.ts`** – Consumes the same IDs for update/audit flow tests.

## Notes

- The file uses the `@module` doc annotation (no default export); all consumers must import the named constants.
- Because the IDs are resolved at **import time** (top-level `const`), any test that mutates the registry *after* importing this file will still see the original values. If a test needs different IDs, it should call the `apps.ts` functions directly rather than importing this fixture.
