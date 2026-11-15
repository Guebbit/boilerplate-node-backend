---
source: tests/cross-cutting/step-up-auth-routes.test.ts
sha256: 6377a025314d70499242e103e232fe17ecd7db6c013e62c6f1b40b8b2531e516
generated_at: 2026-11-14T23:08:08.328471+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/step-up-auth-routes.test.ts

## Purpose

Verifies, in one place, that the app-wide step-up authentication guards (`requireFreshAuth` / `requireFreshAuthWhen`) are mounted on **exactly** the money- and identity-sensitive routes they are declared for, at the correct tier (critical or sensitive). It checks both directions: every entry in the canonical table is still a mounted route (no stale entries), and every mounted route carrying a step-up guard appears in the table (no silent tier change or undocumented gate). Adding a new money/identity route requires adding it to `STEP_UP_ROUTES`, making the property inheritable rather than remembered.

## Key elements

- **`ROUTERS`** — `Record<string, Router>` mapping module name → Express router for the seven modules that carry money, identity, or role routes (account, cart, payments, delivery, returns, users, orders).
- **`STEP_UP_ROUTES`** — `Record<string, string[]>` mapping `"module METHOD /path"` to the exact guard labels expected on that route. Encodes both unconditional guards and conditional ones (`requireFreshAuthWhen`), and supports multiple guards per route (e.g. `account DELETE /` carries both a conditional and an unconditional guard).
- **`mountedStepUps()`** — Scans every router via `routeSignatures` + `guardsOn`, collecting all step-up guard labels per route into a map with the same key shape as `STEP_UP_ROUTES`.
- **`describe('step-up auth guards exactly the routes it is declared for')`** — Three tests:
  1. No stale key: every `STEP_UP_ROUTES` key resolves to a mounted signature.
  2. Per-route labels: `it.each` asserts `guardsOn` returns the expected labels (via `arrayContaining`).
  3. Exact-set match: `mountedStepUps()` deep-equals `STEP_UP_ROUTES` (nothing extra, nothing missing).
- **Jest mocks** — Cache, rate-limit, upload, and authorization middlewares are all stubbed via helpers from `tests/support/routes.ts` so guard inspection is deterministic.

## Relationships

- **`tests/support/routes.ts`** — Source of `guardsOn`, `routeSignatures`, `cacheMock`, `securityMock`, `storageMock`, and `authGuardsMock`. All inspection logic and mocks flow through this shared helper.
- **`src/modules/account/routes.ts`**, **`src/modules/cart/routes.ts`**, **`src/modules/delivery/routes.ts`**, **`src/modules/orders/routes.ts`**, **`src/modules/payments/routes.ts`**, **`src/modules/returns/routes.ts`**, **`src/modules/users/routes.ts`** — The seven routers under test. The test imports each `router` export and walks their mounted signatures; it does not call handlers.
- **`tests/contract/authorization-contract.test.ts`** — Complementary coverage on the key-declared half of step-up (enforced by `requirePermission`). This file covers only the route-mounted half; the header comment explicitly names that split.

## Notes

- A route can carry **two** step-up guards (e.g. `account DELETE /`): the conditional one prompts 2FA-armed accounts for an OTP, and the unconditional one is the only gate for accounts without a second factor. The table lists both; the "exactly this table" test enforces that no extra guard slips in.
- `PUT`/`PATCH /account` deliberately carry **no** step-up guard (documented in the table's comment). If someone adds one, the exact-set test will fail until the table is updated.
- The `payments POST /:id/sync` route is at **critical** tier (same as confirm) because the provider callback settles money even though the caller did not supply a payment method — the comment in the table explains this non-obvious tier choice.
- The test never exercises route handlers; it only inspects the middleware chain. A guard removed from a route (or added at the wrong tier) is caught by the exact-set assertion, not by a behavioral failure.
