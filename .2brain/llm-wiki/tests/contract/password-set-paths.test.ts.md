---
source: tests/contract/password-set-paths.test.ts
sha256: b459ac0d473e222706504deb014b57c8f3f3f27d655d0f6e4d138d5af18c6eef
generated_at: 2026-10-29T06:39:49.954145+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/password-set-paths.test.ts

## Purpose

System-scoped contract test that guarantees every code path writing a password performs the same breach-check, exercised over real HTTP routes. It covers the three owner-side entry points (signup, authenticated change, token-based reset/setup) and includes a canary that pins the *exact* set of password-setting routes against the bundled OpenAPI spec, so a new route that writes a password cannot appear without also gaining a breach-check case.

## Key elements

- **`BREACHED_PASSWORD`** (`'Password1!'`) — a composition-valid password from `shared/rules/breached-passwords.txt`, shared with all other breach tests in the repo.
- **`PasswordSetPath`** — interface describing one password-writing route: a `name` and an `attempt()` that POSTs the breached password and returns a `response` plus an `assertNoChange` closure.
- **`signupPath` / `changePath` / `resetPath`** — the three concrete paths (`POST /account/signup`, `POST /account/password`, `POST /account/password/reset/confirm`). `change` and `reset` both funnel through the same `passwordChange` service; `signup` runs its own check.
- **`describe.each` block** — asserts each path returns **422** and leaves no trace (no new row / old credential still valid).
- **`operationsThatSetAPassword()`** — parses `openapi.yaml` at test time, finds every operation whose request body references a schema containing a `PasswordNew` property, and returns the sorted list of `METHOD /route` strings.
- **Canary `describe`** — asserts that list equals exactly the three known routes, failing on any unlisted addition.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`@tests/contract`) that configures the contract-test environment.
- **`tests/support/http.ts`** — provides `api` (supertest wrapper) and `authenticateAs` used to drive real HTTP calls and obtain bearer tokens.
- **`tests/support/paths.ts`** — provides `REPO_ROOT`, used to locate `openapi.yaml` on disk.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a clean test database before any assertion.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser`, `PLAIN_PASSWORD`, and `userRepository` (used for the signup no-trace assertion and the change/reset relogin checks).
- **`src/modules/users/repository.ts`** — accessed indirectly via `userRepository.findOne` from the user factories.
- **`src/modules/account/tests/factories.ts`** — `plantToken` mints a one-time password-reset token for the reset path.
- **`package.json`** — test-runner configuration; the `contracts:bundle` script produces the `openapi.yaml` the canary reads.

## Notes

- The canary reads `openapi.yaml` from the repo root at test time; the file must exist (produced by `npm run contracts:bundle`).
- Because `BREACHED_PASSWORD` passes all composition rules, a 422 can only originate from the breach check — not from a validation-layer rejection.
- The test lives in `tests/contract/` (not a module's own `tests/` dir) because the invariant spans multiple modules (`account`, `users`) and is about the *system boundary*, not one service.
- Adding a new password-setting route requires two deliberate steps: (1) add it to the OpenAPI spec, (2) add a `PasswordSetPath` entry and breach-check case here. Omitting either will fail CI.
