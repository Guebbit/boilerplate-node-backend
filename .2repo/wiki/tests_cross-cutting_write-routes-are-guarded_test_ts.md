# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

Enforces one app-wide invariant in a single place: every write route (POST/PUT/PATCH/DELETE) across all routed modules is guarded by `isAuth` then `isAdmin`, unless the route appears in the `WRITE_EXCEPTIONS` table with an explicit reason. This replaces the weaker pattern of repeating "my writes are admin-guarded" inside each module's own `routes.test.ts`, which would leave a thirteenth module with no test suite completely unguarded.

## Key elements

- **`ROUTED_MODULES`** — static `Record<string, Router>` mapping each of the twelve module names to its Express router. Intentionally hardcoded (not derived from `src/modules.ts`) so a new module directory silently lacks a guard until someone adds a line here.
- **`WRITE_METHODS`** — the four state-changing HTTP methods the assertion applies to.
- **`WriteException`** — `{ requiresAuth: boolean; reason: string }`. `requiresAuth: false` is reserved for routes with no session yet (login, signup) or token-in-body credential routes (reset-confirm, verify-confirm, logout).
- **`WRITE_EXCEPTIONS`** — the authoritative list of every write route that is *not* admin-only, keyed `"<module> <METHOD> <path>"`. Each entry documents *why* the exception exists.
- **`writesOn(router)`** — helper that flattens a router's route table down to `"<METHOD> <path>"` strings for write methods only.
- **Test: "imports one router per module directory"** — reads `src/modules/` from disk and asserts the set of directories containing a `routes.ts` exactly matches `Object.keys(ROUTED_MODULES)`. This is the safety net for forgotten modules.
- **Test: "has no stale exception"** — asserts every key in `WRITE_EXCEPTIONS` still corresponds to a mounted write, catching dead entries.
- **Test: per-route guard assertion** (`it.each`) — for every write on every module, verifies the guard chain. Default path: `isAuth` before `isAdmin` must both be present. Exception path: `isAdmin` must be absent; `isAuth` presence matches `requiresAuth`.

## Relationships

- **All twelve `src/modules/*/routes.ts`** — imported directly (one router per module) to inspect their mounted routes and guard middleware. The file does *not* go through the `src/modules.ts` registry, keeping its import surface minimal.
- **`tests/support/routes.ts`** — provides `effectiveRouteTable` (flattens nested routers into a flat route list) and `guardsOn` (returns the ordered guard-middleware names for a given signature). Also supplies the shared jest mocks (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) that are hoisted via `jest.mock`.
- **`src/modules/observability/routes.ts`** — imported but contains no write routes; the per-route `it.each` block is skipped for it via `if (writes.length === 0) continue`.

## Notes

- `jest.mock` calls appear before the module imports in source order, but Jest hoists them; the `requireActual` pattern ensures the shared mock factories in `tests/support/routes.ts` are loaded first so all twelve routers see identical middleware stubs.
- `POST /search` on `products` and `orders` are in `WRITE_EXCEPTIONS` not because they skip auth, but because they are reads that use POST to avoid GET-body cache-key invisibility. The `orders` variant still requires auth because the orders router blanket-applies `isAuth`.
- Adding a new module requires **two** changes: a new directory under `src/modules/` with a `routes.ts`, and a new line in `ROUTED_MODULES`. The "one router per module directory" test fails if either step is missed.
- The exception list is deliberately long — most writes in this app are user-scoped (cart, wishlist, addresses, sessions) rather than admin actions. The list is a decision log, not a short allowlist.
