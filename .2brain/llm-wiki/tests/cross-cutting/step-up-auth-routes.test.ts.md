---
source: tests/cross-cutting/step-up-auth-routes.test.ts
sha256: 7aea76c34d47d4708551b1be33f33b15f1e0a13f46a53025a59ba7ae5bfb842b
generated_at: 2026-10-29T06:50:40.212721+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/step-up-auth-routes.test.ts

## Purpose

Verifies that step-up authentication guards (`requireFreshAuth` / `requireFreshAuthWhen`) are applied to exactly the set of money- and identity-sensitive routes documented in `STEP_UP_ROUTES`, at the correct tier, and nowhere else. The check is bidirectional: every table entry must still be a mounted route, and every mounted route carrying the guard must appear in the table. This ensures a future developer adding a money or identity route inherits the guard by failing this test rather than by remembering to add it.

## Key elements

- **`STEP_UP_ROUTES`** — The canonical table mapping `"${module} METHOD /path"` strings to the exact guard labels expected (e.g. `requireFreshAuth(critical)`, `requireFreshAuthWhen(sensitive)`). Covers 25 routes across cart, payments, account, returns, orders, and users.
- **`ROUTERS`** — The seven Express routers under test, keyed by module name (`account`, `cart`, `payments`, `delivery`, `returns`, `users`, `orders`).
- **`mountedStepUps()`** — Scans every route in `ROUTERS` via `routeSignatures` + `guardsOn`, collects all labels starting with `requireFreshAuth(` or `requireFreshAuthWhen(`, and returns a map in the same key format as `STEP_UP_ROUTES`.
- **Three test cases** — (1) no stale entry (every key in `STEP_UP_ROUTES` is a live route), (2) each route carries its declared labels, (3) the full set of mounted guards equals the table exactly (no extra routes, no missing ones, no tier drift).

## Relationships

- **`tests/support/routes.ts`** — Supplies `guardsOn` and `routeSignatures` for route inspection, and provides `cacheMock`, `securityMock`, `storageMock`, and `authGuardsMock` used in the `jest.mock` calls. `authGuardsMock` is the mechanism that records which guard label each route received, making the assertions possible.
- **`src/modules/account/routes.ts`, `cart/routes.ts`, `payments/routes.ts`, `delivery/routes.ts`, `returns/routes.ts`, `users/routes.ts`, `orders/routes.ts`** — The routers under test. This file imports each module's `router` export and inspects their mounted middleware chain.
- **`src/modules/delivery/routes.ts`** — Imported into `ROUTERS` but has no entries in `STEP_UP_ROUTES`; its inclusion in the sweep means any future guard added to a delivery route will be caught by the "nowhere else" assertion.

## Notes

- The file deliberately covers only the **route-mounted** half of step-up auth. The action-key half (e.g. `delete:User`, `create:Refund` enforcing step-up via `shared/authorization-keys.yaml` + `requirePermission`) is tested in `tests/unit/kernel/step-up.test.ts` and is **not** asserted here.
- Some routes carry **two** guards (e.g. `account DELETE /` has both `requireFreshAuthWhen` and `requireFreshAuth`). The test checks the full array, not just the first match — the conditional guard may be skipped for accounts without 2FA, leaving the unconditional one as the sole gate.
- Adding a new money/identity route requires adding an entry to `STEP_UP_ROUTES` **and** mounting the guard; failing either side fails this test. Removing a route or changing its tier without updating the table also fails.
- The mock for `@kernel/middlewares/authorizations` delegates to `authGuardsMock` from `tests/support/routes.ts`, meaning the guard recording is centralized in the shared test support rather than re-implemented per test file.
