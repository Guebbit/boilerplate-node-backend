---
source: src/modules/account/tests/contract/login-paths.contract.test.ts
source_sha256: 4d4afe38c45ea76f35d52d7ccd2ed39651e759931d0ef0ee86073ddd15fa164b
context_sha256: f6ecd35b72c9ba021b59d810309f7107fb72ccc5560a3f931bbd0dd400aef9b4
generated_at: 2026-11-22T03:50:32.593608+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/login-paths.contract.test.ts

## Purpose
A contract test that checks the invariants every way of obtaining a session shares, once across all entry points (password login, OAuth login, session continuation) instead of per-bug. It exists because earlier bugs (OAuth login audited or metriced wrongly; deactivated or soft-deleted accounts completing an OAuth login or a refresh) each slipped through one path. Password login is included as the baseline.

## Key elements
- **`LoginPath` interface**: describes one entry point, driven over real HTTP routes. Fields: `name`, `attemptRefused(kind, auditSpy)`, `assertRefused(response)`, and the optional `attemptSuccess(role)` and `successStatus`.
- **`passwordPath`**: `POST /account/login`. A refused attempt must answer 401. Success answers 200.
- **`oauthPath`**: the fake-provider callback, already-linked-identity branch. A refused attempt must be a 302 whose `location` contains `error=` and which sets no `__Host-session` or `isAuth` cookie. Success answers 302.
- **`continuationPath`**: continues a session that was minted before the account was banned or deleted. In `jwt` mode it calls `POST /account/refresh`. In `cookie` mode it calls `GET /account` with the cookie. A refused attempt must answer 401. It has no `attemptSuccess`.
- **`fakeLogin()` / `attemptCookies()`**: run a start → callback round trip through the fake OAuth provider. The state and verifier cookies (`__Host-oauth_state`, `__Host-oauth_verifier`) are forwarded to the callback.
- **`badState(kind)`**: returns the `createUser` overrides for `deactivated` (`active: false`) or `soft-deleted` (`deletedAt`).
- **Refusal table** (`describe.each` over all three paths): for deactivated and soft-deleted accounts, asserts the path-specific refusal and that no successful login audit event (action `AUTH_LOGIN`, outcome `success`) was emitted.
- **Success table** (password and OAuth only): for membership `admin` and `customer`, asserts exactly one `AUTH_LOGIN` audit event. It must carry the right `actorUserId`, `actorRole` (`admin` → `admin`, `customer` → `user`) and outcome `success`. It also asserts that `authLoginTotal.inc` is called with `{ status: 'success' }`.
- **`armed()` / `ARMED_ATTEMPTS`**: start a further section for accounts with two-factor enabled. Each way in must stop at the challenge. The visible content shows the password and OAuth entries.

## Relationships
- `tests/support/contract.ts` (imported as `@tests/contract`), `tests/support/setup-test-db.ts` (`setupTestDb()`), `tests/support/http.ts` (`api()`), and `tests/support/cookies.ts` (`setCookie`, `cookieHeader`) provide the test harness, the database, the HTTP client and cookie helpers.
- `tests/support/ports.ts` supplies `auditPortMock()` and `observePort()`. The file mocks `src/infrastructure/observability/audit.ts` with the former and spies on `emitAuditEvent` with the latter.
- `src/modules/users/tests/factories.ts` supplies `createUser`, `PLAIN_PASSWORD` and `userRepository`, which seed accounts. `userRepository` comes from `src/modules/users/repository.ts` and is used for `linkOAuthAccount` and `findByIdWithCredentials`.
- `src/modules/account/oauth/providers/index.ts` (`registerOAuthProvider`) registers the `fake` provider. The provider itself, `fakeOAuthProvider`, comes from `scenarios/support/doubles/oauth-fake.ts`.
- `src/modules/account/audit.ts` supplies `accountAuditActions`, used for the `AUTH_LOGIN` action.
- `src/modules/account/metrics.ts` supplies the `authLoginTotal` counter, which is spied on.
- `src/modules/account/session/config.ts` supplies `getSessionMode()`, which selects the continuation path's behaviour and title.

## Notes
- The audit module is replaced with `jest.mock` rather than `spyOn`. CommonJS namespace exports are non-configurable getters that `spyOn` cannot redefine under every transform.
- `auditSpy` is cleared immediately before the call under test. The continuation path's setup performs a genuine successful login, and that event must not be mistaken for something the refused attempt audited.
- A refused password attempt still audits an `AUTH_LOGIN` failure, on purpose, so that an unknown or blocked account costs an attacker no less than a live one. The shared rule is only that no path audits a success.
- Refresh is deliberately absent from the success table. It audits `AUTH_TOKEN_REFRESHED` and counts `auth_refresh_total`, a different rule from the shared `recordLoginSuccess` path used by password and OAuth login.
- The `fake` OAuth provider is registered in `beforeAll` because production seeds no such entry. `afterEach` calls `jest.restoreAllMocks()`.
