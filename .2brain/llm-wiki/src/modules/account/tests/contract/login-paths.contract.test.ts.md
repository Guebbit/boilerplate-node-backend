---
source: src/modules/account/tests/contract/login-paths.contract.test.ts
sha256: 25bf47463155d054f41ded8d04fc234603d13551265aa7f8e608c7aa954cac56
generated_at: 2026-10-29T02:51:40.801672+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/login-paths.contract.test.ts

## Purpose

Contract test that asserts invariants shared by **all** session-acquisition paths (password login, OAuth login, and session continuation via refresh or next-request) in a single table-driven suite. Two rules are enforced: (1) no path may grant a session or audit a successful `AUTH_LOGIN` for a deactivated/soft-deleted account, and (2) password and OAuth login must each audit the caller's real membership role exactly once and increment the shared `auth_login_total` counter. A third section verifies that all paths stop at a 2FA challenge for an armed account. The suite exists so that a regression in one path is caught against the baseline rather than discovered per-bug.

## Key elements

- **`LoginPath` interface** — structural contract with `name`, `attemptRefused`, `assertRefused`, and optional `attemptSuccess`/`successStatus`. Refresh/continuation omits `attemptSuccess` by design.
- **`passwordPath`, `oauthPath`, `continuationPath`** — the three concrete `LoginPath` instances driving `describe.each`.
- **`fakeLogin()`** — performs a full OAuth start → redirect → callback round trip against the registered `fake` provider.
- **`attemptCookies(start)`** — extracts `__Host-oauth_state` and `__Host-oauth_verifier` from a start response into a single `Cookie` header.
- **`badState(kind)`** — returns the document override for `deactivated` (`active: false`) or `soft-deleted` (`deletedAt`).
- **`armed()`** — document override that enables a TOTP second factor.
- **`ARMED_ATTEMPTS`** — `[name, attempt]` tuples used in the 2FA-challenge `describe.each`.
- **`describe.each` blocks (×3)** — refusal table (all three paths × two states), success audit/metric table (password + OAuth × two roles), and 2FA challenge table (all paths).
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port with `auditPortMock()` from `tests/support/ports`.
- **`beforeAll`** — registers `fakeOAuthProvider` under the id `'fake'`.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** — supplies `fakeOAuthProvider`, the deterministic identity the OAuth path exercises.
- **`src/infrastructure/observability/audit.ts`** — the port whose `emitAuditEvent` is replaced and observed; provides the audit action types.
- **`src/modules/account/audit.ts`** — exports `accountAuditActions` (e.g. `AUTH_LOGIN`, `AUTH_TOKEN_REFRESHED`) used to filter spy calls.
- **`src/modules/account/metrics.ts`** — exports `authLoginTotal`; the test spies on its `.inc` to assert the shared counter fires exactly once.
- **`src/modules/account/oauth/providers/index.ts`** — `registerOAuthProvider` wires the fake provider into the runtime for the suite.
- **`src/modules/account/session/config.ts`** — `getSessionMode()` determines whether the continuation path targets `POST /account/refresh` (jwt mode) or an arbitrary cookie-bearing request (cookie mode); also names the path dynamically.
- **`src/modules/users/repository.ts`** — `userRepository` is used to link an OAuth identity and to mutate a user's `active`/`deletedAt` fields mid-test.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` build test fixtures.
- **`tests/support/contract.ts`** — global contract-test setup (imported for side effects).
- **`tests/support/cookies.ts`** — `setCookie` / `cookieHeader` helpers for reading and composing cookie values.
- **`tests/support/http.ts`** — `api()` returns a configured `supertest` agent against the running app.
- **`tests/support/ports.ts`** — `observePort` wraps a function in a jest mock; `auditPortMock` provides the factory used by the `jest.mock` replacement.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` prepares the in-memory database before the suite runs.

## Notes

- The audit port is **replaced** (via `jest.mock` + factory), not spied on, because a CommonJS namespace import exposes each export as a non-configurable getter that `jest.spyOn` cannot redefine under this repo's transform pipeline. See `tests/support/ports.ts` for the helper.
- `auditSpy.mockClear()` is called **after** any setup login and **immediately before** the attempt under test, so a legitimate `AUTH_LOGIN` from the setup step is not mistaken for the event the assertion targets.
- The refresh/continuation path is deliberately **absent** from the success table: it audits `AUTH_TOKEN_REFRESHED` against `auth_refresh_total`, a different rule owned by `services/refresh.ts`.
- The continuation path's displayed name and request method switch at runtime based on `getSessionMode()` (`'cookie'` vs `'jwt'`).
- A refused password attempt still emits an `AUTH_LOGIN` event with `outcome: 'success'` = **false** (i.e. a failure event); the invariant is that no path emits a **successful** `AUTH_LOGIN`.
