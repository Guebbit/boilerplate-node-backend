---
source: tests/cross-cutting/authenticated-controllers.test.ts
sha256: 3ebea560f85d4d02d70fe18636156a70cb14bcea48868bee117c8ef16f32ff78
generated_at: 2026-09-23T19:53:45.735365+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authenticated-controllers.test.ts

## Purpose

Cross-cutting integration test that catches a class of runtime `TypeError` before it ships: a controller that non-null-asserts `request.authContext` (i.e. assumes the caller is a resolved human session) while its route is not actually guarded by `isAuth`. It also enforces that every `requirePermission` key mounted behind the dual `isAuthOrCredential` guard uses the tenant-scoped `.any.` breadth, not `.self.`.

## Key elements

- **`MODULES_ROOT` / `moduleNames()`** — Resolves `src/modules/` and lists every subdirectory, router-backed or not.
- **`ASSERTS_AUTH_CONTEXT`** — Regex `/\bauthContext!/` matching a non-null assertion on the identifier `authContext` regardless of whether `request.` is prefixed (catches destructured reads).
- **`handlersReadingAuthContext(moduleRoot)`** — Scans a module's `controllers/` directory; returns the set of exported handler names whose source contains the assertion.
- **`handlersMountedUnauthenticated(router)`** — Walks the Express route stack via `effectiveRouteTable`; returns handler names on rows whose chain/applies do **not** include `isAuth`.
- **`permissionKeysBehindCredentialGuard(router)`** — Returns `requirePermission` keys on rows that include `isAuthOrCredential` in their chain.
- **`describe('every controller reading the caller…')`** — First test: asserts the intersection of "reads authContext" and "mounted unauthenticated" is empty. Second test (canary): asserts at least 10 handlers were actually scanned so an empty offender list is meaningful.
- **`describe('every requirePermission key behind isAuthOrCredential…')`** — First test: asserts no key lacks the `any` breadth segment. Second test (canary): asserts at least 10 such keys exist.

## Relationships

- **`tests/support/routes.ts`** — Provides `effectiveRouteTable(router)`, the resolved-Express route table this test queries to determine which middleware stack each handler sits under. Also supplies the four `jest.mock` factory helpers (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) that stub infrastructure middlewares so the router can be constructed without side effects.
- **`tests/support/routed-modules.ts`** — Provides `ROUTED_MODULES`, a map from module name to its instantiated Express `Router`, which this test iterates per module.

## Notes

- Deliberately checks `isAuth` only, **not** `isAuthOrCredential`. A credential (`sk_…`) resolves to `request.caller` with no `authContext` at all, so `authContext!` behind the dual guard is equally broken; accepting both would remove the only check distinguishing the two guards.
- The test reads the **resolved** Express route stack rather than regex-ing `routes.ts` source, so guards written via variables, spreads, or multi-line `router.use` calls are still detected.
- Each main assertion is paired with a "canary" test that asserts a minimum count of items was scanned. This prevents a silent regression where the scanner stops finding any files and the test passes vacuously.
- `handlersReadingAuthContext` matches on the bare identifier `authContext!`, not `request.authContext!`, so `const { authContext } = req; authContext!` is still flagged.
