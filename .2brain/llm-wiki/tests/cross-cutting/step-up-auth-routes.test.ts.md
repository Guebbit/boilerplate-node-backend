---
source: tests/cross-cutting/step-up-auth-routes.test.ts
sha256: a4a7e721250d692fac3ac6b31779f84da8a1d8990c4d1e1d0c153efa3850adc6
generated_at: 2026-10-15T12:41:25.991700+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/step-up-auth-routes.test.ts

## Purpose

Cross-cutting integration test that pins the **exact** set of routes carrying a step-up authentication guard (`requireFreshAuth` or `requireFreshAuthWhen`) across five money/identity routers. It enforces the `STEP_UP_ROUTES` table in both directions — every listed route must still be mounted, and every mounted step-up guard must appear in the table — so a new or changed guard is immediately visible here rather than silently appearing in a router file.

## Key elements

- **`STEP_UP_ROUTES`** — Canonical `Record<string, string>` table. Keys are `` `${module} ${METHOD} ${path}` ``; values are the exact guard label (e.g. `requireFreshAuth(critical)`, `requireFreshAuthWhen(sensitive)`) that `authGuardsMock` records. Serves as both the test's expected data and the project's single documentation of which routes demand step-up auth and at which tier.
- **`ROUTERS`** — Map of the five routers under test (`account`, `cart`, `payments`, `delivery`, `returns`) to their Express `Router` instances.
- **`mountedStepUps()`** — Introspects every route on every router via `routeSignatures` / `guardsOn`, collects the first step-up guard label found per route, and returns the result keyed the same way as `STEP_UP_ROUTES`. Used by the bidirectional-equality assertion.
- **Three test cases** (under one `describe`):
  1. *No stale entry* — every key in `STEP_UP_ROUTES` resolves to a mounted route.
  2. *Carries the expected label* — `it.each` over the table; asserts `guardsOn` includes the exact label.
  3. *Exact table match* — `mountedStepUps()` deep-equals `STEP_UP_ROUTES` (catches unlisted mounts and wrong-tier drift).
- **Jest mocks** — `cache`, `rate-limit`, `upload`, and `authorizations` middlewares are all replaced with fakes from `@tests/routes` so the test isolates step-up-guard behavior from infrastructure.

## Relationships

- **`tests/support/routes.ts`** — Source of `guardsOn`, `routeSignatures`, and the mock factories (`cacheMock`, `securityMock`, `storageMock`, `authGuardsMock`). All introspection and mock wiring flows through this module.
- **`src/modules/account/routes.ts`, `src/modules/cart/routes.ts`, `src/modules/payments/routes.ts`, `src/modules/delivery/routes.ts`, `src/modules/returns/routes.ts`** — The routers whose mounted middleware stack the test reads. No route file imports from this test; the dependency is one-directional (test → routers).
- **`tests/contract/authorization-contract.test.ts`** — Complementary coverage: that contract test exercises the `requirePermission` / `stepUp:` key path (action-based step-up, e.g. `users.any.delete`). This file covers the route-mounted guard path (caller's own identity). The file's header comment states the split explicitly.

## Notes

- **Two-step-up mechanisms, two test files.** A route mounts `requireFreshAuth(When)` directly when freshness is a property of the *route* (caller's own record). When freshness is a property of the *action*, `shared/authorization-keys.yaml` declares `stepUp:` and `requirePermission` enforces it; `tests/unit/kernel/step-up.test.ts` covers that path. Confusing the two will lead you to the wrong test file.
- **Bidirectional equality is the core assertion.** Test 3 (`mountedStepUps()` equals `STEP_UP_ROUTES`) is the strongest check: it catches a new guard added to a router without a table entry *and* a table entry pointing to a route that no longer carries the guard. Tests 1 and 2 exist so a failure message identifies the specific route.
- **`requireFreshAuthWhen` vs `requireFreshAuth`.** The `When` variant is conditional (e.g. `delivery` ship/deliver only step-up when `forced: true`; `account` password/profile changes only step-up when a second factor is armed). The table records the first guard label encountered on a route; `account DELETE /` has both a conditional and an unconditional guard, and the table key maps to the conditional one.
- **Tier comments in `STEP_UP_ROUTES`** are load-bearing documentation (e.g. why `payments POST /:id/sync` is critical, why `returns POST /` is conditional). Treat them as the canonical "why this tier" rationale.
