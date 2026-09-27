---
source: tests/cross-cutting/authenticated-controllers.test.ts
sha256: 16c8c009a154d1491d37b0988904065c12f8e2800a3655346b1d3be4c0bead29
generated_at: 2026-09-27T15:49:30.147956+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authenticated-controllers.test.ts

## Purpose

Cross-cutting invariant test that enforces two auth-middleware guarantees across every module: (1) any controller that non-null-asserts `authContext` must be mounted behind `isAuth` (not merely `isAuthOrCredential`), and (2) every `requirePermission` key behind `isAuthOrCredential` must be tenant-scoped (contain an `.any.` segment). It exists to catch the class of runtime 500s where a handler reads `authContext.id` on a route the auth middleware never populates.

## Key elements

- **`ASSERTS_AUTH_CONTEXT`** — Regex `/\bauthContext!/` matching a non-null assertion (not an optional `?.` read, not a bare reference).
- **`handlersReadingAuthContext(moduleRoot)`** — Scans `controllers/*.ts` under a module for the regex; returns the set of exported handler names that assert `authContext`.
- **`handlersMountedUnauthenticated(router)`** — Walks `effectiveRouteTable(router)` and collects handler names from rows whose `applies` + `chain` do **not** include `isAuth`.
- **`permissionKeysBehindCredentialGuard(router)`** — Returns the `requirePermission` keys from rows that **do** include `isAuthOrCredential`.
- **`moduleNames()`** — `readdirSync(MODULES_ROOT)`; lists every module directory (routed or not).
- **Test: "finds no handler asserting an auth context its route does not guarantee"** — Cross-references the two sets above per module and expects no intersection.
- **Test: "actually finds controllers to check" (canary)** — Asserts the total count of asserting handlers is > 10, so an empty scan cannot masquerade as a pass.
- **Test: "finds no key with a different breadth segment"** — Filters `isAuthOrCredential` keys lacking `.any.` and expects none.
- **Test: "actually finds keys to check" (canary)** — Asserts > 10 keys are seen, preventing a false green from zero routes.
- **Jest mocks** — Stubs `cache`, `route-flag`, `upload`, and `rate-limit` middlewares via factories exposed by `@tests/routes` so route resolution stays deterministic.

## Relationships

- **`tests/support/routes.ts`** — Source of `effectiveRouteTable` (the resolved middleware-per-route table used for all guard lookups) and the mock factories consumed by the `jest.mock` calls.
- **`tests/support/routed-modules.ts`** — Provides `ROUTED_MODULES`, the name → Express `Router` map that lets the test build each module's route table without booting the full app.
- **`tests/support/paths.ts`** — Supplies `MODULES_ROOT`, the filesystem root under which `moduleNames()` and `handlersReadingAuthContext` operate.
- **`src/kernel/registry.ts`** — Indirect dependency: the `ROUTED_MODULES` entries are populated from the module registry, so the set of modules this test iterates is ultimately defined there.

## Notes

- The guard check is intentionally **`isAuth` only**, not `isAuthOrCredential`. An `sk_…` credential resolves to `request.caller` with no `authContext`, so a `!` read behind the split guard is just as broken as one behind no guard. Widening the filter would remove the only check distinguishing the two.
- The regex targets `authContext!` (word-boundary) rather than `request.authContext!` so that a destructured `const { authContext } = request; authContext!.x` is still caught.
- Optional reads (`authContext?.prop`, passing `authContext` as a nullable helper argument) are deliberately **not** flagged — they are the correct pattern behind `isAuthOrCredential`.
- Route guards are inspected via `effectiveRouteTable` (the resolved Express stack), not by regexing `routes.ts` source. This handles guards written through variables, spreads, or multi-line `router.use` calls.
- Both invariant blocks pair their assertion with a **canary** count test; if the scanning code silently stops finding targets, the canary fails before the "no offenders" assertion can produce a false green.
