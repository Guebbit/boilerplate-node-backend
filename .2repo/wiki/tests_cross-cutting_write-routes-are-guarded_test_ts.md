# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

Enforces a single app-wide invariant: **every write route (POST/PUT/PATCH/DELETE) must be guarded by `isAuth` then `isAdmin`** unless explicitly listed in `WRITE_EXCEPTIONS` with a documented reason. It exists so that a 13th module added to `src/modules/` inherits the guarantee automatically rather than needing to restate it in its own per-module `routes.test.ts`.

## Key elements

- **`ROUTED_MODULES`** – Static `Record<string, Router>` mapping all twelve module names to their exported routers. Intentionally *not* imported via the registry (`src/modules.ts`) to keep the dependency surface minimal and to make the "one router per module directory" assertion a hard fail.
- **`WRITE_METHODS`** – `Set(['POST', 'PUT', 'PATCH', 'DELETE'])`; the only HTTP verbs this guard applies to.
- **`WriteException`** – Interface with `requiresAuth: boolean` and `reason: string`, describing why a route is exempt from the admin default.
- **`WRITE_EXCEPTIONS`** – The canonical list of every write route deliberately *not* admin-only (e.g. cart CRUD, wishlist, account self-service, payment intent/confirm) or that needs no session at all (login, signup, token-confirmed routes). Each entry carries a human-readable `reason`.
- **`writesOn(router)`** – Extracts all write-method route signatures from a router via `effectiveRouteTable`.
- **Test: "imports one router per module directory"** – Scans `src/modules/` on disk for directories containing `routes.ts` and asserts the set matches `ROUTED_MODULES` keys, catching new modules that would otherwise slip through unguarded.
- **Test: "has no stale exception"** – Asserts every key in `WRITE_EXCEPTIONS` still corresponds to a mounted write route.
- **Test (parameterised): per-route guard check** – For each write route, verifies either the default (`isAuth` before `isAdmin`) or the exception's expected guard shape. Skips modules with zero writes (e.g. `observability`) to avoid `it.each` rejecting an empty table.

## Relationships

- **`tests/support/routes.ts`** – Supplies `effectiveRouteTable`, `guardsOn`, and the four `jest.mock` factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) used to neutralise infrastructure middleware so the test inspects pure guard order.
- **Each `src/modules/<name>/routes.ts`** (account, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist) – The routers under test. The file imports each module's `router` export directly; it never calls them, only introspects their mounted route table and guard chain.

## Notes

- The `jest.mock` calls are placed **before** the router imports (ESM import hoisting still works because the factories delegate to `jest.requireActual` on the shared test-support module).
- `ROUTED_MODULES` is deliberately static. Adding a new module directory with a `routes.ts` but forgetting to add a line here fails the disk-scan assertion immediately.
- `observability` is included in `ROUTED_MODULES` but contributes zero write routes; the loop `continue`s past it. Removing it from the map would still pass the disk-scan test as long as the directory has no `routes.ts`, but it *does* have one—so it must stay in the map.
- Exception keys use the exact format `` `${module} ${METHOD} ${path}` `` (e.g. `'cart DELETE /:productId'`); a mismatch in spacing or path parameter style will silently fall through to the "must be admin" branch and fail.
