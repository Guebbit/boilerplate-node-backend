---
source: tests/cross-cutting/step-up-auth-routes.test.ts
sha256: e4f54b7734e1e4b6d7a1b1018537fe5550c87f2ac8bc777f7896b787a3013401
generated_at: 2026-09-23T20:00:48.078629+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/step-up-auth-routes.test.ts

## Purpose

Cross-cutting test that asserts the step-up (re-authentication) guards on money and identity routes in the account, cart, and payments modules are applied at exactly the tiers declared in a single `STEP_UP_ROUTES` table. It checks the mapping in both directions so that a stale table entry, a silently removed guard, or a quiet tier change all fail the suite.

## Key elements

- **`STEP_UP_ROUTES`** — `Record<string, string>` mapping `${module} ${METHOD} ${path}` to the exact guard label (e.g. `requireFreshAuth(REAUTH_TIME_CRITICAL)` or `requireFreshAuthWhen(REAUTH_TIME_SENSITIVE)`). Serves as the single source of truth for which routes carry which tier.
- **`ROUTERS`** — `Record<string, Router>` holding the three routers under test (account, cart, payments), keyed by module name.
- **`mountedStepUps()`** — Walks every route on every router via `routeSignatures`/`guardsOn`, collects only guards whose label starts with `requireFreshAuth(` or `requireFreshAuthWhen(`, and returns the same key shape as `STEP_UP_ROUTES`.
- **`describe` block** — Four tests:
  1. No stale entry (every key in `STEP_UP_ROUTES` is still mounted).
  2. `it.each` over `STEP_UP_ROUTES` verifies the expected guard label is present on the route.
  3. `mountedStepUps()` deep-equals `STEP_UP_ROUTES` (no extra mounts, no missing ones, no tier drift).
  4. `REAUTH_TIME_CRITICAL < REAUTH_TIME_SENSITIVE` sanity check to catch a swapped-constant typo that the structural checks above would not catch.
- **Jest mocks** — Cache, rate-limit, upload, and authorization middlewares are all mocked via factories re-exported from `tests/support/routes.ts` so that importing the routers does not pull in real infrastructure.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Imported (un-mocked) for the `REAUTH_TIME_CRITICAL` and `REAUTH_TIME_SENSITIVE` constants used to build expected labels and for the tier-ordering assertion. The middleware module itself is mocked out during router import.
- **`src/modules/account/routes.ts`**, **`src/modules/cart/routes.ts`**, **`src/modules/payments/routes.ts`** — Their exported routers are the subjects under test; the test reads their route tables and guard chains but does not call handlers.
- **`tests/support/routes.ts`** — Provides the `guardsOn` and `routeSignatures` helpers used to introspect Express routers, and the mock factories (`cacheMock`, `securityMock`, `storageMock`, `authGuardsMock`) wired into the `jest.mock` calls.

## Notes

- The file deliberately covers only **route-mounted** step-up guards. Action-level step-up (enforced inside `requirePermission` via `stepUp:` entries in `shared/authorization-keys.yaml`) is a separate mechanism tested by `tests/unit/kernel/step-up.test.ts`; routes like `users.any.delete` and `payments.any.update` carry no mounted guard and are intentionally absent from `STEP_UP_ROUTES`.
- `payments POST /:id/sync` is placed at the critical tier because the sync settles money from the provider's response, not from caller-supplied data — the comment in the table documents this rationale.
- `account PUT /` is the only route using `requireFreshAuthWhen` (conditional freshness); all others use the unconditional `requireFreshAuth`. The `mountedStepUps` collector treats both prefixes as step-up guards.
- The tier-ordering test (`toBeLessThan`) is a cheap guard against a constant swap that would be invisible to the structural checks, since both values are just numbers to Jest.
