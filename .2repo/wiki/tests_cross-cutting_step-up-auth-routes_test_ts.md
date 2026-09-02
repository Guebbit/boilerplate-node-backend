# tests/cross-cutting/step-up-auth-routes.test.ts

## Purpose

Guarantees that every money or identity route across the account, cart, and payments modules carries a `requireFreshAuth` or `requireFreshAuthWhen` guard at the correct tier (critical or sensitive), and that no route carries the guard without being documented in the `STEP_UP_ROUTES` table. The check runs in both directions (stale-entry and silent-omission) so the table stays the single source of truth for which routes are gated.

## Key elements

- **`STEP_UP_ROUTES`** — The canonical registry: maps `"${module} ${METHOD} ${path}"` keys to the exact guard label expected (e.g. `requireFreshAuth(1)` for critical, `requireFreshWhen(5)` for sensitive). Twelve entries covering checkout, payments, account CRUD, 2FA, logout, and data export.
- **`ROUTERS`** — The three `express.Router` instances under inspection (account, cart, payments), keyed by module name.
- **`mountedStepUps()`** — Walks every route on every router via `routeSignatures` + `guardsOn`, collecting the actual step-up guard label found (if any) into a flat record.
- **`jest.mock` blocks** — Stub out cache, rate-limit, storage, and the `authorizations` middleware so the test inspects guard *labels* recorded by `authGuardsMock` without executing real auth logic.
- **Four `it` blocks** — (1) no stale key in `STEP_UP_ROUTES`; (2) each listed route actually carries the expected label; (3) `mountedStepUps()` equals `STEP_UP_ROUTES` exactly (bidirectional); (4) `REAUTH_TIME_CRITICAL < REAUTH_TIME_SENSITIVE` as a sanity guard against the two constants being swapped.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Source of `REAUTH_TIME_CRITICAL` and `REAUTH_TIME_SENSITIVE` constants and the `requireFreshAuth`/`requireFreshAuthWhen` guard factories. Mocked via `authGuardsMock` so the test reads recorded labels rather than executing real session logic.
- **`src/modules/account/routes.ts`**, **`src/modules/cart/routes.ts`**, **`src/modules/payments/routes.ts`** — The routers whose mounted routes are introspected. Their `router` exports are the sole subjects of the assertions.
- **`tests/support/routes.ts`** — Provides `guardsOn`, `routeSignatures`, and the mock factories (`cacheMock`, `securityMock`, `storageMock`, `authGuardsMock`) used here and shared with other route tests.
- **`tests/contract/authorization-contract.test.ts`** — Sibling test that validates the authorization *contract* (what the guards do when called); this file validates *placement* (where the guards are attached and at which tier).

## Notes

- The test does **not** exercise the guards end-to-end; it asserts on label strings recorded by the mock. A route that *calls* the guard with a wrong tier number would pass checks 1–3 but would be caught only by check 4 if the constant values were accidentally swapped.
- `account PUT /` uses `requireFreshAuthWhen` (conditional freshness) rather than the unconditional `requireFreshAuth`, reflecting that freshness depends on what fields changed. The expected label string includes the `When` variant.
- Adding a new money/identity route requires adding its entry to `STEP_UP_ROUTES` in the same commit; otherwise check 3 (`mountedStepUps() toEqual STEP_UP_ROUTES`) will fail.
- The mock of `@kernel/middlewares/authorizations` means the real guard implementation is never executed here—tier semantics are validated only by the constant-comparison assertion.
