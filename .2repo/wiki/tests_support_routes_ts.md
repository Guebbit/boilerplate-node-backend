# tests/support/routes.ts

## Purpose

Provides a route-table introspection utility and a set of jest mock factories that label Express middleware produced by factory functions (which would otherwise appear as anonymous closures). Together they let each module's route test assert the **complete** set of mounted methods, paths, and middleware chains—including the arguments captured inside factory closures (cache tags, TTLs, upload field names, auth tiers)—so that any silent route or middleware change must be a deliberate, reviewable edit to the test.

## Key elements

- **`ROUTE_LABEL`** — `Symbol.for('tests.routeLabel')`; the key under which a factory's rendered call is attached to its middleware function.
- **`labelled(label)`** — returns a no-op middleware carrying `label` on `ROUTE_LABEL`; the base building block for all mocks.
- **`text(value)` / `list(values)`** — render scalars and arrays into unambiguous assertion strings (avoids `[object Object]`).
- **`parseValue(raw)`** — inverse of `text`/`list`; recovers the original value from a rendered string.
- **`optionsOf(chain, factory)`** *(exported)* — extracts `key=value` pairs from a factory's label on a route's middleware chain. Stopgap that parses this file's own rendering format.
- **`cacheMock()`** *(exported)* — replaces `setCache`, `searchCache`, `invalidateCache` with label-recording versions; spreads the real module so `noStore` and other direct exports still resolve.
- **`securityMock()`** *(exported)* — maps `credentialLimiters` to index-labelled entries and labels `submissionLimiter`, preserving the pair's length.
- **`routeFlagMock()`** *(exported)* — labels `routeFlag('name')` calls.
- **`authGuardsMock()`** *(exported)* — labels `requireFreshAuth(maxAgeSeconds)` / `requireFreshAuthWhen(predicate, maxAgeSeconds)` while passing through named guards (`isAuth`, `isAdmin`, `getAuth`).
- **`storageMock()`** *(exported)* — calls **through** to the real `upload.single` and prepends the field-name label, so downstream handlers (`validateUploadedImages`, `quarantineUploadedImages`) remain visible in the chain.
- **`routeTable(router)`** *(exported, truncated in source)* — walks an Express `Router` and returns `RouteRow[]` (`{ method, path, chain: string[] }`) for every mounted endpoint.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — `cacheMock` is a drop-in replacement registered via `jest.mock`; spreads the real module to keep `noStore` and other non-factory exports intact.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `securityMock` maps `credentialLimiters` (preserving length) and labels `submissionLimiter`.
- **`src/kernel/middlewares/authorizations.ts`** — `authGuardsMock` replaces the two step-up factories; named guards pass through unchanged.
- **`src/infrastructure/adapters/storage.ts`** — `storageMock` calls through to the real `upload.single` so the chain retains its validation/quarantine handlers.
- **`src/modules/*/tests/unit/routes.test.ts`** (account, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users) — each consumer file declares its own `jest.mock(...)` one-liner pointing at the relevant `*Mock()` export, then asserts against `routeTable(router)`.

## Notes

- **`jest.mock` must be declared in the consuming test file, not imported from this helper.** Jest hoists `jest.mock` calls per module registry; a helper file cannot register the mock for another module's scope.
- **`require` inside the mock factory, not the imported binding.** `jest.mock` factories may not close over module-scope variables; the idiomatic workaround is `require('@tests/routes').cacheMock()`.
- **`passThrough` uses `.bind(undefined)` per call** rather than a fresh closure, so each labelled middleware has a distinct function identity while sharing one body.
- **`optionsOf` is a deliberate stopgap.** It parses the string that `text`/`list` just produced, so the coupling to the rendering format is isolated to this file. It only recovers `key=value` pairs; positional arguments (e.g. `setCache`'s `ttl`) are skipped.
- **Mocks spread `jest.requireActual` first** so any export not explicitly overridden (e.g. `noStore`, `isAuth`) continues to resolve to the real implementation.
- **`text` narrows by type** instead of calling `String()`: objects are `JSON.stringify`-ed so two different configurations can never render identically.
