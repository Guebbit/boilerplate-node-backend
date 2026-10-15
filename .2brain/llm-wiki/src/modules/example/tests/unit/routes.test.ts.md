---
source: src/modules/example/tests/unit/routes.test.ts
sha256: 79c2bb31a880df6a162a41a7cc52c098ac67f09afaf22c4c8166aaacc4d0c9c8
generated_at: 2026-10-15T10:31:32.758754+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/routes.test.ts

## Purpose

Unit test that pins down the **structural invariants** of the example route table: the exact set and order of mounted endpoints, which routes sit above vs. below the positional auth gate (`getAuth` / `isAuth`), and the relative ordering of middleware in specific chains. It exists because the auth boundary is purely positional — a route placed on the wrong side of `router.use(getAuth, isAuth)` compiles fine and fails silently — so the test encodes that constraint as executable assertions rather than relying on types.

## Key elements

- **`jest.mock` (× 3)** — stubs `cache`, `rate-limit`, and `upload` middlewares by delegating to `cacheMock()`, `securityMock()`, `storageMock()` exported from the test-support module, so the real middleware never loads.
- **`import { router }` from `@modules/example/routes`** — the single unit under test.
- **`describe('what is mounted')`** — asserts `routeSignatures(router)` equals the exact 9-element array, locking both membership and order.
- **`describe('the positional guard')`** — uses `guardsOn` / `identityGuardIndex` to verify `GET /published/:id` has no `getAuth` or `requirePermissionGuard`; all other 8 routes do. Also asserts the public route is index 0 and `POST /search` precedes `GET /:id`.
- **`describe('what runs before the write')`** — uses `chainOf` to assert middleware ordering: budget-check before controller (`POST /`), and `uploads` → `upload.image` → controller (`PUT /:id/cover`).

## Relationships

- **`src/modules/example/routes.ts`** — the file under test; this file imports its `router` export and makes all assertions against it.
- **`tests/support/routes.ts`** — supplies the four assertion helpers (`chainOf`, `routeSignatures`, `guardsOn`, `identityGuardIndex`) and the three mock factories used by the `jest.mock` calls. The file's JSDoc explicitly points to this module for the positional-guard rationale.

## Notes

- **Auth is positional, not declarative.** There is no per-route "public" flag; the only boundary is the `router.use(getAuth, isAuth)` line. The tests therefore check *position* (index, guard presence) rather than a route property. If a new public route is added, it must be inserted *above* the gate and the "public route first" assertion updated.
- **`jest.requireActual` on the test-support path.** The mocks resolve to the *test* module, not the real middleware packages, to avoid pulling infrastructure code into the unit-test graph.
- **`chainOf` assertions check relative order, not exact membership.** Only the relative positions of named handlers are asserted; the rest of the chain (logging, response shaping, etc.) is intentionally unconstrained.
