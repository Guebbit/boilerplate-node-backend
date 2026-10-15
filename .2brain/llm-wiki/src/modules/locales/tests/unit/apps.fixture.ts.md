---
source: src/modules/locales/tests/unit/apps.fixture.ts
sha256: cd387de8b7c27036fd2a000ba6646c0e9b2b699d114d8899f3d71699c3007136
generated_at: 2026-10-15T10:48:25.283349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/apps.fixture.ts

## Purpose
Provides canonical app-id constants for the locales unit-test suite. Instead of hardcoding ids, it reads them live from the `apps` registry so that tests can never drift from the values the service actually accepts.

## Key elements
- **`BACKEND`** — the demo backend app id, obtained by calling `backendApp()` at module-load time.
- **`FRONTEND`** — the demo frontend app id, obtained by calling `frontendApp()` at module-load time.
- Both are simple exported `const` bindings; no functions, classes, or side effects beyond the two registry calls.

## Relationships
- **`src/modules/locales/apps.ts`** — the sole import source; supplies `backendApp` and `frontendApp` whose return values are frozen into the two exports here.
- **`src/modules/locales/tests/unit/service.test.ts`** and **`src/modules/locales/tests/integration/repository.test.ts`** — downstream consumers that import `BACKEND`/`FRONTEND` to key rows without repeating the registry lookup.

## Notes
- The values are resolved once at import time (not lazily). If the registry is mutated *after* this module has loaded, the fixtures will still hold the original ids — this is intentional: tests want a stable reference.
- Because the file is a `@module` (no default export), consumers must use named imports: `import { BACKEND, FRONTEND } from '…/apps.fixture'`.
