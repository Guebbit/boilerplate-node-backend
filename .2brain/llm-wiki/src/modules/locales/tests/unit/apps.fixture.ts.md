---
source: src/modules/locales/tests/unit/apps.fixture.ts
source_sha256: cd387de8b7c27036fd2a000ba6646c0e9b2b699d114d8899f3d71699c3007136
context_sha256: 106bd34d72824f70cdc915015374fcc4fd64bbcc4d640f53a78cf90f721319b7
generated_at: 2026-11-22T05:51:18.177679+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/unit/apps.fixture.ts

## Purpose
A tiny test fixture that supplies the two app ids the locales test suite writes rows under: the demo backend and frontend apps. The values are read from the app registry instead of being hard-coded, so tests can't drift from what the service accepts.

## Key elements
- `BACKEND` — the demo backend app id, computed once at import time via `backendApp()`.
- `FRONTEND` — the demo frontend app id, computed once at import time via `frontendApp()`.

## Relationships
- Imports `backendApp` and `frontendApp` from `src/modules/locales/apps.ts`, which is the source of the ids.
- Listed as related to `src/modules/locales/tests/unit/service.test.ts`, `src/modules/locales/tests/integration/repository.test.ts` and `src/modules/locales/tests/integration/update-audit.test.ts`, the suites that use these ids when writing rows.

## Notes
- The ids are evaluated when the module loads, not per test. Despite the "live" wording in the doc comments, they are fixed for the lifetime of the test process.
- Despite living under `tests/unit/`, the fixture is shared with the integration tests.
