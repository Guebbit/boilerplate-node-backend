# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit test for the cart router that pins down three invariants: the exact set and declaration order of endpoints, the authorization posture (authenticated, never admin), and the caching policy (invalidate at checkout, never set a shared cache). It exists so that accidental reordering, guard changes, or cache additions break the build immediately.

## Key elements

- **`ALL`** — the expected list of nine `METHOD /path` signatures, used as the source of truth for every assertion.
- **`chainOf(signature)`** — helper that looks up the middleware chain for a route signature via `routeTable(router)`.
- **`describe('…what is mounted')`** — asserts `routeSignatures(router)` equals `ALL` and that literal paths (`/summary`, `/checkout`, `/all`) are declared before `/:productId`.
- **`describe('…authorization')`** — iterates every signature in `ALL` to confirm `isAuth` is present; separately asserts no route carries `isAdmin`.
- **`describe('…caching')`** — confirms `POST /checkout` includes `invalidateCache([orders|products])` and that no route in `ALL` uses `setCache`.
- **`jest.mock('@infrastructure/http/middlewares/cache', …)`** — replaces the real cache middleware with `cacheMock()` from the test-support module before the router import.

## Relationships

- **`src/modules/cart/routes.ts`** — the module under test; the test imports its exported `router` and inspects its route table, guards, and middleware chains.
- **`tests/support/routes.ts`** — provides the shared test utilities (`routeTable`, `routeSignatures`, `guardsOn`, `cacheMock`) that this file uses to interrogate any Express router in a uniform way.

## Notes

- Route **ordering** is part of the contract: Express matches first-declared, so if `/all` or `/summary` were declared after `/:productId`, the literal would be swallowed as a product id. The test enforces this with explicit `indexOf` comparisons.
- The "absence" assertions (no `isAdmin`, no `setCache`) are deliberate invariants, not gaps. Adding an admin route or a shared cache to the cart module will fail these tests by design.
- The `jest.mock` for the cache middleware must appear before the `import { router }` line; reordering those two statements will cause the real middleware to be loaded and the caching assertions to test the wrong thing.
