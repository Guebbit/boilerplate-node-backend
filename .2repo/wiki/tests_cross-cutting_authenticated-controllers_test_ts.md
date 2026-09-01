# tests/cross-cutting/authenticated-controllers.test.ts

## Purpose

Cross-cutting invariant test: every controller handler that calls `authContextOf()` must be mounted on a route whose middleware stack includes `isAuth`. It closes the gap that no single type can cover — a controller can be written to read the caller while `routes.ts` accidentally leaves the route public — by inspecting the *resolved* Express middleware stack rather than re-parsing route source text.

## Key elements

- **`ROUTED_MODULES`** — maps the twelve module names to their actual Express `Router` instances (imported from each module's `routes.ts`), giving the test the real mounted middleware chain.
- **`handlersReadingAuthContext(moduleRoot)`** — reads every `controllers/*.ts` file in a module directory, finds files containing `authContextOf(`, and extracts exported handler names via regex. Returns a `Set<string>`.
- **`handlersMountedUnauthenticated(router)`** — iterates `effectiveRouteTable(router)` rows; collects every handler in a row whose `applies`/`chain` does **not** include `isAuth`. Returns a `Set<string>`.
- **`moduleNames()` / `MODULES_ROOT`** — lists every subdirectory under `src/modules/` so the test also covers modules that have *no* router (they are simply skipped).
- **Test 1** (`finds no handler asserting an auth context its route does not guarantee`) — intersects the two sets per module; expects an empty offender list.
- **Test 2** (`actually finds controllers to check`) — canary: asserts the total count of auth-reading handlers across all modules exceeds 10, guarding against a vacuous pass.
- **`jest.mock` blocks** — stubs `cache`, `route-flag`, `storage`, and `rate-limit` middlewares (via helpers exported from `@tests/routes`) so the real routers can be constructed without infrastructure dependencies.

## Relationships

- **`tests/support/routes.ts`** — supplies `effectiveRouteTable` (resolves a Router into per-route middleware chains) and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) used in the `jest.mock` calls.
- **All twelve `src/modules/*/routes.ts`** — imported for their `router` export; the test inspects their fully-mounted middleware stacks. The test does *not* import individual controllers; it reads their source from disk.
- **`src/modules/*/controllers/*.ts`** (indirect, via `readFileSync`) — the test statically scans these files at test time to discover which handlers call `authContextOf(`.

## Notes

- The test intentionally uses the *real* mounted Express routers (not a re-parse of `routes.ts` source) so that guards applied via variables, spreads, or multi-line `router.use` calls are still detected — Express has already resolved them into a uniform stack by the time `effectiveRouteTable` reads them.
- New modules that add a router must be added to `ROUTED_MODULES` in this file (and the companion `write-routes-are-guarded.test.ts`); the `moduleNames()` scan will find the directory, but the test silently skips modules absent from `ROUTED_MODULES`.
- The canary threshold (`> 10`) is a soft floor; if the codebase shrinks below that, the assertion will need updating. It exists to catch a regression where the source-scanning regex stops matching (e.g., a rename of `authContextOf`) and the main test passes vacuously.
