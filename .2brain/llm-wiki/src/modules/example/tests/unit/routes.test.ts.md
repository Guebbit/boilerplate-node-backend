---
source: src/modules/example/tests/unit/routes.test.ts
sha256: e296029ae24c01eca3a915f114d2f60e351f324fd241ba970991e236e5aad762
generated_at: 2026-11-08T05:56:30.756717+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/routes.test.ts

## Purpose

Unit test that verifies the example module's route table is mounted correctly: endpoint signatures and their order, the positional placement of the auth gate (`getAuth` / `isAuth`), and the ordering of middleware chains (budget guards before controllers). The assertions are deliberately positional because a route typed into the wrong half of the auth split would pass a naive presence check.

## Key elements

- **`describe('example routes: what is mounted')`** — asserts the full ordered list of `METHOD /path` signatures on the router.
- **`describe('example routes: the positional guard')`** — checks that `GET /:id` is the only route *above* the `isAuth` gate (identity guard index `-1`, no `requirePermissionGuard`), that every other route sits *below* it (index ≥ 0, has `requirePermissionGuard`), and that `POST /search` precedes `PUT /:id` so the literal word is never captured as `:id`.
- **`describe('example routes: what runs before the write')`** — uses `chainOf` to assert middleware ordering: creation-budget guard runs before the `example-create` controller; `uploads` budget check runs before `upload.image` read, both before the cover controller.
- **Three `jest.mock` calls** — stub `cache`, `rate-limit`, and `upload` infrastructure middlewares with factories from `@tests/routes`.
- **Helpers imported from `@tests/routes`** — `routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`.

## Relationships

- **`src/modules/example/routes.ts`** — the module under test; this file imports `router` from it and asserts on its mounted handlers.
- **`tests/support/routes.ts`** — provides the assertion helpers (`routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the mock factories (`cacheMock`, `securityMock`, `storageMock`) used by the `jest.mock` shims.

## Notes

- All order-sensitive assertions are intentional: the file's doc comment explains that a route landing in the wrong half of `router.use(getAuth, isAuth)` would be silently mis-authorized, so tests pin *position*, not just membership.
- The `jest.mock` factories call `jest.requireActual('@tests/routes')` — the support module doubles as the mock provider; do not replace it with a plain object without also updating those factory calls.
- `identityGuardIndex(guards)` returns `-1` when no identity-requirement guard is present; any change to the guard naming convention in the support file will break these checks.
