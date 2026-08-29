# tests/support/routes.ts

## Purpose

Test-only utilities that inspect an Express router's internal stack to produce a deterministic table of every mounted endpoint, its middleware chain, and its router-level guards. This makes silent route-configuration changes (missing auth guard, wrong cache tag, reordered `/:id`) visible as assertion failures instead of undetected regressions.

## Key elements

- **`ROUTE_LABEL`** — A `Symbol.for('tests.routeLabel')` used to stamp mock middleware with the factory call that produced it (e.g. `setCache(3600, tags=[product|products])`).
- **`RouteRow`** — Interface: `{ method, path, chain: string[] }` representing one mounted endpoint.
- **`cacheMock()`** — Replacement factory for `@infrastructure/http/middlewares/cache`; spreads the real module (preserving `noStore`), then replaces `setCache` / `invalidateCache` with labelled pass-throughs that record TTL, tags, key parameters, and `browserRevalidate`.
- **`securityMock()`** — Replacement for `@infrastructure/http/middlewares/security`; maps the real `credentialLimiters` array (preserving its length) and labels each entry by index.
- **`routeFlagMock()`** — Replacement for `@infrastructure/http/middlewares/route-flag`; records the flag name.
- **`storageMock()`** — Replacement for `@infrastructure/adapters/storage`; calls *through* to the real `upload.single` so downstream handlers (`validateUploadedImages`, `storeUploadedImages`) remain visible, prepending a label for the field name.
- **`routeTable(router)`** — Reads `router.stack` and returns `RouteRow[]` in mount order (method, path, named/labelled handler chain).
- **`routerMiddleware(router)`** — Returns the ordered list of router-level (`router.use`) middleware, separate from per-route chains.
- **`routeSignatures(router)`** — Compact `["GET /:id", "POST /", …]` for quick assertions.
- **`effectiveRouterMiddleware(router)`** — (truncated in source) Pairs each route with the *preceding* `router.use` guards by stack position, reflecting that `router.use` only guards routes mounted below it.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — `cacheMock` spreads this module's real exports, then overrides `setCache` and `invalidateCache` with labelled versions. Tests `require` the mock via the `jest.mock` factory.
- **`src/infrastructure/http/middlewares/security.ts`** — `securityMock` reads the real `credentialLimiters` array and labels each element by index, preserving length.
- **`src/infrastructure/adapters/storage.ts`** — `storageMock` calls through to the real `upload.single`, prepending a label while keeping the original handler chain intact.
- **`src/modules/*/tests/unit/routes.test.ts`** (account, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist) — Each declares its own `jest.mock` for the relevant middleware modules (pointing at the factories above) and then asserts against `routeTable`, `routerMiddleware`, `routeSignatures`, or `effectiveRouterMiddleware` for its module's router.

## Notes

- **`jest.mock` is per-module-registry and hoisted.** Each test file must declare its own mock one-liner (`jest.mock('…', () => require('@tests/routes').cacheMock())`); the helper file cannot apply it centrally.
- **`require` inside the factory**, not the imported binding — `jest.mock` factories must not close over module scope.
- **Mount order is load-bearing and preserved.** `/:id` must come after `/search` and `/categories` in the stack; the table is not sorted.
- **`handlerName` uses `||` (not `??`)** on `handle.name` so that inline arrow handlers (whose `name` is `''`) render as `(anonymous)` rather than a blank entry.
- **`cacheMock` spreads the real module first** to keep non-factory exports like `noStore` functional; replacing the entire module would break `router.use(noStore)`.
- **`securityMock` preserves array length** of `credentialLimiters` rather than collapsing to a single label, so dropping one of the two limiters is visible.
- **`text()` uses `JSON.stringify` for objects** instead of `String()`, preventing two different option objects from producing the identical `[object Object]` label.
