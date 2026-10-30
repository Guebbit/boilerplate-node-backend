---
source: tests/cross-cutting/authenticated-controllers.test.ts
sha256: 1090f5cbd4ffd9661253c501585b90f9a6976a989ac4d6b07e7e0a79104f3186
generated_at: 2026-10-29T06:43:34.792705+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authenticated-controllers.test.ts

## Purpose

Cross-cutting invariant test that closes a gap TypeScript cannot: a controller asserting `request.authContext!` (non-null) claims its route is behind `isAuth`, but whether the *route* actually carries that guard lives in routing code, not in types. This file verifies that claim by cross-referencing source-level assertions with the resolved Express middleware stack. A second invariant ensures every `requirePermission` behind `isAuthOrCredential` asks for a tenant-scoped, owner-agnostic rule (since credential callers carry no `authContext` at all).

## Key elements

- **`moduleNames()`** — lists every directory under `MODULES_ROOT` (`src/modules/`), whether or not it exports a router.
- **`ASSERTS_AUTH_CONTEXT`** — regex `/\bauthContext!/` matching a non-null assertion (not optional chaining, not an optional parameter). Intentionally matches the bare token so a destructured `const { authContext } = request; authContext!.id` is still caught.
- **`handlersReadingAuthContext(moduleRoot)`** — scans a module's `controllers/*.ts` for the regex above; returns the set of exported handler names (`export const name = …`) that assert.
- **`handlersMountedUnauthenticated(router)`** — walks `effectiveRouteTable(router)` and returns handler names on rows whose `applies` + `chain` do **not** include `isAuth`.
- **`permissionsBehindCredentialGuard(router)`** — collects `PermissionAsk[]` from rows whose chain includes `isAuthOrCredential`.
- **`describe('every controller reading the caller…')`** — cross-references the two sets above per module; fails if a handler asserting `authContext!` is mounted unauthenticated. Includes a canary test asserting ≥ 10 handlers were actually found.
- **`describe('every requirePermission behind isAuthOrCredential…')`** — resolves each `PermissionAsk` via `findRule(ruleId(…))` and asserts the rule is `scope: 'tenant'` with `conditions === undefined` and `credential !== false`. Includes its own canary.
- **Four `jest.mock` blocks** — stub `cache`, `route-flag`, `upload`, and `rate-limit` middleware with factories exported from `@tests/routes`, so importing real routers doesn't pull in live infrastructure.

## Relationships

- **`tests/support/routes.ts`** — primary dependency. Provides `effectiveRouteTable` (resolves every route's middleware + handler chain as Express sees it), the `PermissionAsk` type, and the four mock factories consumed by the `jest.mock` calls.
- **`tests/support/routed-modules.ts`** — provides `routersOfModule(name)` to obtain the `Router` instance(s) a module exports, feeding both `handlersMountedUnauthenticated` and `permissionsBehindCredentialGuard`.
- **`tests/support/paths.ts`** — provides the `MODULES_ROOT` constant used to enumerate module directories and locate their `controllers/` folders.
- **`src/kernel/permissions.ts`** — provides `findRule` and `ruleId` to resolve a `PermissionAsk` into its declared rule metadata (scope, conditions, credential flag) for the credential-guard invariant.

## Notes

- **`isAuth` vs `isAuthOrCredential` is the crux.** The first `describe` deliberately checks only `isAuth`. Widening to accept `isAuthOrCredential` would silently permit `authContext!` reads that 500 on credential calls — the test exists precisely to keep that split enforced.
- **Canary tests are load-bearing.** Each `describe` includes an `it('actually finds …')` assertion (≥ 10 items). Without them, a typo in the regex, a rename of `MODULES_ROOT`, or a removed `controllers/` directory would turn a real failure into a vacuous pass.
- **Source is read as text; routes are resolved as objects.** Controllers are grepped via `readFileSync` + regex (no import), while route middleware is read from the live `Router` through `effectiveRouteTable`. This avoids the weaker alternative of regexing `routes.ts`, which would miss variable-indirected guards, spreads, and multi-line `router.use` calls.
- **`src/kernel/registry.ts`** appears in the dependency graph but is not directly imported here; it is reached transitively through the router/middleware resolution path.
