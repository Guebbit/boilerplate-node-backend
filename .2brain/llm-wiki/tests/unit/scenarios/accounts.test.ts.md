---
source: tests/unit/scenarios/accounts.test.ts
sha256: 8c067d39bf3996e57ccf5aeee306adca182d460bb2a89dbb338d121b8d7227c1
generated_at: 2026-11-08T10:29:03.326445+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/accounts.test.ts

## Purpose

Unit-tests the `@scenarios/accounts` module to guarantee that the demo seed identities used by `npm run demo` (and consumed by the paired frontend's e2e suite via `GET /__test/scenario`) are internally consistent: every account has a unique email, every password satisfies the same zod policy enforced by the signup endpoints, env-var overrides are picked up correctly, and `seedCredentials` publishes exactly the credentials each account was seeded with.

## Key elements

- **`satisfiesPolicy(password)`** – Thin helper that runs `SignupBody.shape.password.safeParse` and returns a boolean. Serves as the single policy gate every password assertion in this file relies on.
- **`reloadWith(admin, user)`** – Sets `NODE_SEED_ADMIN_PASSWORD` / `NODE_SEED_USER_PASSWORD` via `setEnvironment`, calls `jest.resetModules()`, then dynamically re-imports `@scenarios/accounts`. Necessary because the password constants are read at module scope and cannot be mutated after initial evaluation.
- **`afterEach`** – Calls `jest.resetModules()` to prevent a dynamically-imported module from leaking into the next test.
- **`describe('the demo identities')`** – Asserts admin and user have distinct emails.
- **`describe('the seeded passwords')`** – Verifies defaults pass policy, fallbacks are non-empty, per-account env overrides work independently.
- **`describe('seedCredentials')`** – The bulk of the suite. Checks exact object shape for admin/user, presence and policy-compliance of all four personas (`unverified`, `twoFactor`, `pendingEmail`, `banned`), all four staff roles (`manager`, `warehouse`, `support`, `operator`), TOTP secret presence on staff but not on the shopper, backup codes on the `twoFactor` persona, email uniqueness across all accounts, and that env overrides propagate into `seedCredentials`.

## Relationships

- **`scenarios/accounts.ts` (`@scenarios/accounts`)** — The module under test. Exports `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`, `SEED_TWO_FACTOR_BACKUP_CODES`, `SEED_STAFF_TOTP_SECRET`, and `seedCredentials`. This test file is the only consumer that exercises its env-var override path; all other consumers import the pre-evaluated constants.
- **`tests/support/environment.ts` (`@tests/environment`)** — Supplies `setEnvironment`, which this file calls inside `reloadWith` to inject `NODE_SEED_*_PASSWORD` values before the module re-evaluation.
- **`@api/schemas.zod`** — Source of the `SignupBody` schema; the test imports `SignupBody.shape.password` to derive the policy oracle.

## Notes

- The entire test hinges on the module-reload pattern. Adding a new env-var-driven constant to `@scenarios/accounts` requires adding it to both `reloadWith`'s parameter list and the relevant assertion — the module will not pick up a new variable unless the import is re-executed.
- The policy check is intentionally coupled to the *signup* schema (`SignupBody`), not to a separate "seed" schema. This means a future relaxation of the signup policy automatically relaxes the seed requirement, and vice-versa.
- The `twoFactor` persona is the only non-staff entry expected to carry `backupCodes`; no assertion guards against *extra* properties on other personas beyond the explicit `not.toHaveProperty('totpSecret')` check on `user`.
