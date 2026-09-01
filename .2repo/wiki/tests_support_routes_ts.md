# tests/support/routes.ts

## Purpose

Test-support utility that reads an Express router's mounted route table (method, path, middleware chain) back into an assertable string form. It also provides `jest.mock` factories that replace middleware *factories* (cache, rate-limit, route-flag, storage) with labelling wrappers so their call arguments — TTL, tags, field names, flag values — appear in the route table where anonymous closures would otherwise hide them. The goal: a route file's full configuration is a one-line snapshot, and any change to it (dropped auth, renamed cache tag, wrong path) forces a visible test edit.

## Key elements

- **`routeTable(router)`** *(implied by truncation)* — walks `router.stack` and returns an array of `RouteRow` objects (`method`, `path`, `chain: string[]`).
- **`optionsOf(chain, factory)`** — parses the rendered factory label on a chain back into a `key=value` record. Stopgap; only handles named options (skips positional args).
- **`cacheMock()`** — mock factory for `@infrastructure/http/middlewares/cache`. Spreads the real module (preserving `noStore`), then replaces `setCache`, `searchCache`, `invalidateCache` with labelling wrappers that record TTL, tags, keyParameters, keyAs, browserRevalidate.
- **`securityMock()`** — mock factory for `@infrastructure/http/middlewares/rate-limit`. Maps the real `credentialLimiters` array, labelling each entry by index so dropping one limiter is visible.
- **`routeFlagMock()`** — mock factory for `@infrastructure/http/middlewares/route-flag`. Labels the flag name.
- **`storageMock()`** — mock factory for `@infrastructure/adapters/storage`. Calls *through* to real `upload.single` (preserving downstream handlers like `validateUploadedImages`) and prepends a label carrying the field name.
- **`ROUTE_LABEL`** — `Symbol.for('tests.routeLabel')`; the internal key on which labelled middlewares store their rendered factory call.
- **`labelled(label)`** — returns a no-op middleware (bound `passThrough`) with `[ROUTE_LABEL]` set; used by all mock factories.
- **`handlerName(handle, layerName?)`** — resolves a chain entry's display string: label → function name → Express layer name → `'(anonymous)'`.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — `cacheMock` spreads the real module via `jest.requireActual`, then overrides `setCache`, `searchCache`, `invalidateCache`. `noStore` is inherited unchanged.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `securityMock` spreads the real module and maps `credentialLimiters` into labelled entries.
- **`src/infrastructure/adapters/storage.ts`** — `storageMock` spreads the real module and wraps `upload.single` to prepend a label while preserving the real handlers it returns.
- **Every `src/modules/*/tests/unit/routes.test.ts`** — consumes `routeTable` to snapshot the module's full route table, and must declare the relevant `jest.mock` calls (cache, security, routeFlag, storage) per file because `jest.mock` cannot be hoisted from a helper.

## Notes

- `jest.mock` must be declared in each test file, not imported from this module. Use the `require(...)` form inside the factory (not the imported binding) because Jest disallows closing over module scope in mock factories.
- `optionsOf` is a **stopgap**: it string-parses a label this same file produced. It only handles `key=value` pairs; positional arguments (e.g. `setCache`'s TTL as first arg) are skipped. Prefer direct string assertions until the structured-label rewrite (tracked in `ROUTE_TABLE_TESTS.md` step 5a) lands.
- `handlerName` uses `||` (not `??`) for the function-name check because inline arrow handlers have `name === ''`, which `??` would pass through as a blank entry.
- `list` joins array values with `|` (not `,`) so that an empty array renders as `[]` and is distinguishable from a single-element array in a diff.
- `passThrough` is bound once and reused via `.bind(undefined)` per label — avoids a new closure per route while giving each labelled middleware a distinct function identity (required for `Object.assign` to write the symbol onto that specific function).
