---
source: tests/cross-cutting/step-up-auth-routes.test.ts
sha256: 0e066addde568fd5d8a864c6b8d2f1bd1e7107f644b51832cca05c02c275c7ac
generated_at: 2026-09-27T15:53:04.595314+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/step-up-auth-routes.test.ts

## Purpose

Bidirectional integrity check that the step-up authentication guards (`requireFreshAuth` / `requireFreshAuthWhen`) are applied to **exactly** the money and identity routes listed in `STEP_UP_ROUTES`, at the exact tier declared, and nowhere else. It catches both a guard silently removed from a route and a guard quietly added to one that was never documented here.

## Key elements

- **`ROUTERS`** – Map of the four Express routers under test (`account`, `cart`, `payments`, `delivery`), keyed by module name to match the `STEP_UP_ROUTES` keys.
- **`STEP_UP_ROUTES`** – The single source-of-truth table: each key is `"${module} ${METHOD} ${path}"`, each value is the expected guard label (e.g. `` `requireFreshAuth(${REAUTH_TIME_CRITICAL})` `` or a `requireFreshAuthWhen` variant). Covers 17 routes across checkout, payment intent/confirm/sync, account lifecycle, 2FA setup/confirm/disable/backup-codes, logout-all, session delete, export, and forced ship/deliver.
- **`mountedStepUps()`** – Walks every route signature on every router via `routeSignatures` + `guardsOn`, collecting only entries that start with `requireFreshAuth(` or `requireFreshAuthWhen(`, keyed the same way as `STEP_UP_ROUTES`.
- **Test suite** (4 cases):
  1. *No stale entry* – every key in `STEP_UP_ROUTES` still corresponds to a mounted route.
  2. *Per-route guard check* (`it.each`) – the declared guard label is actually present on the route.
  3. *No undocumented guard* – `mountedStepUps()` deep-equals `STEP_UP_ROUTES` (catches both missing and extra).
  4. *Tier sanity* – asserts `REAUTH_TIME_CRITICAL < REAUTH_TIME_SENSITIVE`, guarding against a constant swap that would pass checks 1–3.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – Source of `REAUTH_TIME_CRITICAL`, `REAUTH_TIME_SENSITIVE`, and the guard factories. The test imports the constants and asserts their relative ordering.
- **`src/modules/{account,cart,payments,delivery}/routes.ts`** – The four routers whose mounted guards are inspected. This test is the cross-cutting counterpart to each module's own unit tests.
- **`tests/support/routes.ts`** – Supplies `routeSignatures`, `guardsOn`, and the mock factories (`cacheMock`, `securityMock`, `storageMock`, `authGuardsMock`) that let the routers be imported without real middleware side-effects.
- **`tests/contract/authorization-contract.test.ts`** – Complementary: verifies the *permission-key* path (`stepUp:` entries in `authorization-keys.yaml` enforced by `requirePermission`). This file covers the *route-mounted* path; together they close the two halves described in the file's header comment.

## Notes

- The file's header explicitly scopes itself: it covers guards mounted **on the route** (a property of the endpoint). Where step-up is a property of the **action** (e.g. `users.any.delete`, `payments.any.update`), the guard lives in `shared/authorization-keys.yaml` and is enforced by `requirePermission`; that path is covered by `tests/unit/kernel/step-up.test.ts`, not here.
- The four `jest.mock` calls at the top replace infrastructure middleware (cache, rate-limit, upload, auth) with mocks so that importing the routers doesn't trigger real side-effects; they delegate to the mock factories in `tests/support/routes.ts`.
- `STEP_UP_ROUTES` is intentionally a flat, hand-maintained table. Adding a new money/identity route without adding an entry here will fail test 3; removing a route without cleaning the table will fail test 1. The table is the contract.
- The `payments POST /:id/sync` entry carries a comment explaining why it is at the CRITICAL tier (it settles money from the provider's response, same risk profile as `/confirm`), not a lower one—useful context if someone "simplifies" the tier.
