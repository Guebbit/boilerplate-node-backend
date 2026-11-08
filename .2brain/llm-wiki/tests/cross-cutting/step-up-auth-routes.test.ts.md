---
source: tests/cross-cutting/step-up-auth-routes.test.ts
sha256: 7aea76c34d47d4708551b1be33f33b15f1e0a13f46a53025a59ba7ae5bfb842b
generated_at: 2026-11-08T09:33:20.635076+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/step-up-auth-routes.test.ts

## Purpose

Verifies that step-up authentication guards (`requireFreshAuth` / `requireFreshAuthWhen`) are mounted on exactly the set of money, identity, and role routes declared in the `STEP_UP_ROUTES` table — and nowhere else. The check is bidirectional: every table entry must still correspond to a live route (no stale entries), and every route that actually carries the guard must appear in the table (no silent tier changes or undocumented additions). This makes the guard table a single source of truth so a newly added money/identity route inherits the requirement without relying on a developer remembering to add the guard.

## Key elements

- **`ROUTERS`** — Map of the seven module routers (account, cart, payments, delivery, returns, users, orders) keyed by module name; the universe the sweep operates over.
- **`STEP_UP_ROUTES`** — The declarative table. Keys are `"module METHOD /path"` strings; values are arrays of expected guard labels (e.g. `` `requireFreshAuth(critical)` `` or `` `requireFreshAuthWhen(sensitive)` ``). Encodes which tier each route uses and whether the guard is unconditional or conditional.
- **`mountedStepUps()`** — Walks every route in every router, collects all guard labels that start with `requireFreshAuth(` or `requireFreshAuthWhen(`, and returns them keyed the same way as `STEP_UP_ROUTES`. Used for the exact-equality check.
- **`describe('step-up auth guards exactly the routes it is declared for')`** — Three assertions:
  - No stale entry: every `STEP_UP_ROUTES` key resolves to a mounted route.
  - Per-route guard presence: for each table entry, the actual guards on that route include the expected labels (via `it.each`).
  - Exact match: `mountedStepUps()` deep-equals `STEP_UP_ROUTES`, catching both missing guards and guards on unlisted routes.

## Relationships

- **`src/modules/{account,cart,payments,delivery,returns,users,orders}/routes.ts`** — Each exports its Express `router`; this test imports all seven to enumerate their mounted routes and guard chains.
- **`tests/support/routes.ts`** — Provides `routeSignatures(router)` (list of `"METHOD /path"` strings) and `guardsOn(router, signature)` (array of guard labels in mount order). Also supplies the factory mocks (`cacheMock`, `securityMock`, `storageMock`, `authGuardsMock`) that this file wires into `jest.mock` for the infrastructure and authorization middleware modules.

## Notes

- The test distinguishes two halves of step-up auth. This file covers **route-mounted** guards (freshness is a property of the route itself). The other half — freshness driven by a permission key (`stepUp:` in `shared/authorization-keys.yaml`, enforced by `requirePermission`) — is covered by `tests/unit/kernel/step-up.test.ts` and is **not** exercised here.
- A single route may carry multiple step-up guards in sequence (e.g. `account DELETE /` has both `requireFreshAuthWhen(critical)` and `requireFreshAuth(critical)`). The per-route assertion uses `arrayContaining`, but the final exact-equality check (`mountedStepUps() === STEP_UP_ROUTES`) catches ordering and multiplicity.
- The mocks for cache, rate-limit, upload, and authorization middleware are injected via `jest.mock` before the router imports, so the routers mount without real infrastructure while `authGuardsMock` still records guard labels for inspection.
- `delivery` is included in `ROUTERS` but has no entry in `STEP_UP_ROUTES`; the test simply asserts it carries no step-up guard (the exact-equality check enforces this).
