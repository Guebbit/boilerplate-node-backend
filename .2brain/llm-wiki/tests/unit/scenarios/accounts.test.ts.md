---
source: tests/unit/scenarios/accounts.test.ts
sha256: fdf9ad5f9efab0744dd3ff8c75d251e054a864a12b371d366a67eeafb9b616e5
generated_at: 2026-10-15T13:23:32.326228+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/accounts.test.ts

## Purpose

Guards the demo seed identities exported by `@scenarios/accounts`. Verifies that every seeded password satisfies the same Zod policy the signup endpoints enforce, that `NODE_SEED_*_PASSWORD` env-var overrides are honoured independently, and that the `seedCredentials` map is internally consistent (unique emails, all personas present, backup codes attached).

## Key elements

- **`satisfiesPolicy(password)`** — one-liner that runs the password through `SignupBody.shape.password.safeParse`; the single source of truth for "does this password pass the real schema?"
- **`reloadWith(admin?, user?)`** — sets `NODE_SEED_ADMIN_PASSWORD` / `NODE_SEED_USER_PASSWORD` via `setEnvironment`, calls `jest.resetModules()`, then dynamically re-imports `@scenarios/accounts` so the module-scope constants re-evaluate.
- **`afterEach`** — calls `jest.resetModules()` to prevent cross-test contamination.
- **`describe('the demo identities')`** — asserts admin and user emails differ.
- **`describe('the seeded passwords')`** — four tests covering: default fallbacks satisfy policy, explicit env-var values are picked up, and overriding one account leaves the other's fallback intact.
- **`describe('seedCredentials')`** — six tests asserting: exact email/password pairs for admin & user; four persona keys (`unverified`, `twoFactor`, `pendingEmail`, `banned`) all present with policy-valid passwords; four staff keys (`manager`, `warehouse`, `support`, `operator`) present with policy-valid passwords; `twoFactor.backupCodes` matches `SEED_TWO_FACTOR_BACKUP_CODES`; all emails are unique; overridden env passwords flow through to `seedCredentials`.

## Relationships

- **`scenarios/accounts.ts`** — the module under test. The test imports its named exports at the top for static assertions and re-imports it (post-`resetModules`) for env-var override scenarios.
- **`tests/support/environment.ts`** — provides `setEnvironment`, the sole mechanism for mutating `process.env` before a module re-load. No other env manipulation occurs in this file.

## Notes

- Passwords are read **at module scope** in `accounts.ts`; the only way to change them in a test is the `resetModules` + dynamic-`import` dance in `reloadWith`. Mutating `process.env` alone has no effect on already-evaluated constants.
- The paired frontend keeps its **own hard-coded login list** (`<paired-frontend>/tests/support/e2e/accounts.ts`); it does not read from this repo. Changing a seed password here without a matching frontend change produces a silent auth failure in the e2e suite with no error on either side.
- `satisfiesPolicy` intentionally reuses the **production Zod schema** rather than a hand-rolled rule, so the test breaks the moment the signup policy tightens.
