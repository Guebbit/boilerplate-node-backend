---
source: tests/cross-cutting/authenticated-controllers.test.ts
sha256: 1090f5cbd4ffd9661253c501585b90f9a6976a989ac4d6b07e7e0a79104f3186
generated_at: 2026-11-08T09:24:00.825222+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authenticated-controllers.test.ts

## Purpose

Cross-cutting invariant test that enforces two rules across all modules: (1) any controller that non-null-asserts `authContext` must be mounted behind `isAuth` (not merely `isAuthOrCredential`), and (2) any `requirePermission` guard mounted behind `isAuthOrCredential` must ask for a tenant-scoped rule with no owner condition and must not be marked `credential: false`. It exists to catch a class of runtime 500s (reading `undefined.id` from a missing `authContext`) that TypeScript cannot express, because the authentication guarantee lives on the route, not in the type.

## Key elements

- **`ASSERTS_AUTH_CONTEXT`** — Regex (`/\bauthContext!/`) that matches non-null assertion of `authContext` in controller source, whether written as `request.authContext!` or after destructuring. Deliberately does **not** match optional reads (`authContext?.x`).
- **`moduleNames()`** — Reads `src/modules/` via `readdirSync(MODULES_ROOT)` to enumerate every module directory.
- **`handlersReadingAuthContext(moduleRoot)`** — Scans a module's `controllers/` directory for files matching `ASSERTS_AUTH_CONTEXT`, then extracts exported handler names (`export const (\w+) =`).
- **`handlersMountedUnauthenticated(router)`** — Walks `effectiveRouteTable(router)` and collects handler names on routes where neither the `applies` stack nor the per-route chain contains `isAuth`.
- **`permissionsBehindCredentialGuard(router)`** — Walks `effectiveRouteTable(router)` and returns the `PermissionAsk[]` attached to routes that carry `isAuthOrCredential`.
- **`describe` block 1** ("every controller reading the caller…") — Asserts the intersection of `handlersReadingAuthContext` and `handlersMountedUnauthenticated` is empty, plus a canary test that the total count of asserting handlers exceeds 10.
- **`describe` block 2** ("every requirePermission behind isAuthOrCredential…") — Asserts no permission ask resolves (via `findRule`/`ruleId`) to a non-tenant scope, a rule with `conditions`, or a rule with `credential: false`. Includes its own canary test.
- **Middleware mocks** — `jest.mock` calls for cache, route-flag, upload, and rate-limit middlewares, each delegating to a factory exposed by `@tests/routes`.

## Relationships

- **`tests/support/routes.ts`** — Primary dependency. Provides `effectiveRouteTable` (the resolved Express route table with guard stacks and permission asks), the `PermissionAsk` type, and the mock-factory helpers used by the four `jest.mock` calls.
- **`tests/support/routed-modules.ts`** — Provides `routersOfModule(name)`, which returns the Express `Router` instances for a given module so the test can introspect their route tables.
- **`tests/support/paths.ts`** — Provides `MODULES_ROOT`, the filesystem root under which module directories live.
- **`src/kernel/permissions.ts`** — Provides `findRule` and `ruleId`, used to resolve a `PermissionAsk` back to its declared rule definition and inspect `scope`, `conditions`, and `credential`.

## Notes

- **`isAuth` only, not `isAuthOrCredential`** — The authContext check intentionally rejects the credential guard. An `sk_…` credential resolves `request.caller` with no `authContext` at all, so a `!` read behind `isAuthOrCredential` is equally broken. Widening the filter to accept both guards would remove the only check distinguishing the two.
- **Route table over source regex** — The test reads the *resolved* Express route stack (`effectiveRouteTable`) rather than grepping `routes.ts` text. This means guards expressed through variables, spreads, or multi-line `router.use` calls are still detected.
- **Canary tests** — Both `describe` blocks include a "actually finds…" test asserting the total inspected count exceeds 10. This prevents a vacuous pass where a refactor accidentally removes all asserting handlers or credential-guarded routes.
- **Destructured reads are caught** — The regex targets `authContext!` (not `request.authContext!`), so a controller that does `const { authContext } = request` and then writes `authContext!.id` is still flagged.
- **Optional reads are exempt by design** — `authContext?.tenant` or passing `authContext` to a helper typed as optional is legitimate behind `isAuthOrCredential` (the guard's whole purpose is the fallback-to-`caller` path) and is not flagged.
