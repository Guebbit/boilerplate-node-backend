---
source: src/modules/account/tests/contract/login-paths.contract.test.ts
sha256: f94402aa1fb457c549f638f82d73ef40981348fac9240d6be727162d6152767c
generated_at: 2026-10-14T09:04:33.391164+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/login-paths.contract.test.ts

## Purpose

Contract test that asserts two invariants shared by every login/session-continuation entry point (password, OAuth, refresh/next-request) in a single pass rather than re-testing them per entry point. Rule 1: no path may mint a session for a deactivated or soft-deleted account. Rule 2: password and OAuth login must each audit the caller's real role and increment the shared `auth_login_total` counter exactly once. Refresh is deliberately excluded from Rule 2 because it audits its own action/counter.

## Key elements

- **`LoginPath`** – interface each entry point conforms to: `name`, `attemptRefused`, `assertRefused`, and optional `attemptSuccess` / `successStatus`. Drives the `describe.each` tables.
- **`passwordPath`** – exercises `POST /account/login`; expects `401` on refusal, `200` on success.
- **`oauthPath`** – exercises the fake OAuth start→callback flow; expects a `302` redirect containing `error=` and no session cookies on refusal, `302` on success.
- **`continuationPath`** – in `jwt` mode hits `POST /account/refresh`; in `cookie` mode makes the next authenticated `GET /account`. Always expects `401`. Name is dynamic via `getSessionMode()`.
- **`fakeLogin`** – performs one full OAuth start→callback round-trip against the `fake` provider.
- **`badState`** – returns the document override (`{ active: false }` or `{ deletedAt }`) that puts an account in a refused state.
- **`armed` / `ARMED_ATTEMPTS`** – 2FA-challenge section (truncated in source): ensures every path stops at a challenge when a second factor is enrolled.
- **`jest.mock('@infrastructure/observability/audit', …)`** – full module replacement (not `jest.spyOn`) that swaps `emitAuditEvent` with a `jest.fn()` and re-wires `recordAudit` to route through it.
- **Two `describe.each` blocks** – one for the refusal table (all three paths × deactivated/soft-deleted), one for the success table (password + OAuth × admin/customer).

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** – `fakeOAuthProvider` is registered via `registerOAuthProvider('fake', …)` in `beforeAll`; all OAuth assertions flow through it.
- **`src/infrastructure/observability/audit.ts`** – mocked wholesale; the test observes `emitAuditEvent` calls to verify audit actions and outcomes.
- **`src/modules/account/audit.ts`** – provides `accountAuditActions.AUTH_LOGIN` (and `.AUTH_TOKEN_REFRESHED`) used in assertions.
- **`src/modules/account/metrics.ts`** – `authLoginTotal.inc` is spied on to verify the shared counter is called exactly once per successful login.
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` seeds the fake provider into the in-test registry.
- **`src/modules/account/session/config.ts`** – `getSessionMode()` switches the continuation path between `POST /account/refresh` (jwt) and a plain authenticated request (cookie).
- **`src/modules/users/repository.ts`** – `userRepository.linkOAuthAccount` wires the fake identity; `findByIdWithCredentials` + `save` deactivates/deletes an account *after* a session is minted.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD`, and `userRepository` re-export for fixture setup.
- **`tests/support/contract.ts`** – imported as a side-effect; sets up contract-test conventions (likely matcher registration or global setup).
- **`tests/support/cookies.ts`** – `setCookie` / `cookieHeader` for reading and forwarding session/CSRF/PKCE cookies across requests.
- **`tests/support/http.ts`** – `api()` returns a configured supertest agent against the running server.
- **`tests/support/ports.ts`** – `observePort` wraps a port function so the test can read its call log without breaking the real wiring.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises an isolated database before the suite runs.

## Notes

- **Audit mock is a replacement, not a spy.** CommonJS namespace imports expose exports as non-configurable getters; `jest.spyOn` cannot redefine them under every transform this repo uses. The `recordAudit` re-wiring in the mock ensures calls that close over the module's own `emitAuditEvent` still land on the spy.
- **Refusal ≠ silence.** A refused password login *does* audit `AUTH_LOGIN` with `outcome: 'failure'` (intentional timing-attack resistance). The contract asserts only that no path audits a *successful* `AUTH_LOGIN` for a bad-state account.
- **Refresh is absent from the success table on purpose.** It audits `AUTH_TOKEN_REFRESHED` and increments `auth_refresh_total`—a different rule, not a gap.
- **`auditSpy.mockClear()` placement matters for the continuation path.** The setup (a real successful login to obtain a session) fires its own `AUTH_LOGIN` event; the clear happens *after* that setup login and *before* the refusal under test, so the spy log contains only the refusal's audit trail.
- **File is truncated** in the source provided; the 2FA-challenge table (`ARMED_ATTEMPTS`) is only partially visible.
