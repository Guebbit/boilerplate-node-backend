---
source: src/modules/account/tests/contract/login-paths.contract.test.ts
sha256: a049594527531ab1e38c1de4a800c994137fbfa1590996b0004ec58142c91689
generated_at: 2026-09-27T14:33:33.230385+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/login-paths.contract.test.ts

## Purpose

Contract test enforcing two shared invariants across every session-entry point (password login, OAuth login, token refresh): (1) none may issue a session for a deactivated or soft-deleted account, and (2) password and OAuth login must both audit the caller's real role and increment the shared `auth_login_total` metric exactly once. It exists so that a regression in any single path (B4, B24) is caught by one table-driven suite rather than per-bug patches.

## Key elements

- **`LoginPath`** (interface) — parameterises one entry point: `name`, `attemptRefused`, `assertRefused`, and optionally `attemptSuccess` / `successStatus`. Lets `describe.each` / `it.each` drive all three paths uniformly.
- **`passwordPath`**, **`oauthPath`**, **`refreshPath`** — concrete `LoginPath` instances. `refreshPath` omits `attemptSuccess` because refresh audits its own `AUTH_TOKEN_REFRESHED` action and `auth_refresh_total` counter (a different rule), so it is excluded from the success table by design.
- **`fakeLogin()`** — performs a full start → callback round-trip against the demo fake OAuth provider, forwarding `oauth_state` / `oauth_verifier` cookies.
- **`attemptCookies(start)`** — extracts CSRF/PKCE cookies from an OAuth start response into a single `Cookie` header string.
- **`badState(kind)`** — returns the document override (`{ active: false }` or `{ deletedAt: … }`) for each refused state.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the module (not spies on it) so `emitAuditEvent` is a controllable `jest.fn` and `recordAudit` is rerouted through that fn. See Notes.
- **`enableDemoProfile()` / `enableDemoProfile(false)`** — in `beforeAll` / `afterAll`, activates the fake OAuth provider for the suite's lifetime.
- **`setupTestDb()`** — initialises the test database before any test runs.

## Relationships

- **`@tests/contract`** — imported as a side-effect (sets up shared contract-test helpers/globals).
- **`@tests/http` (`api`)** — provides the `supertest`-based HTTP client used to hit real routes.
- **`@tests/cookies` (`setCookie`, `cookieHeader`)** — reads/writes cookie helpers for asserting session issuance and forwarding OAuth state.
- **`@tests/ports` (`observePort`)** — wraps `auditPort.emitAuditEvent` as a `jest.MockedFunction` so tests can inspect audit calls.
- **`@tests/setup-test-db`** — creates/resets the test database.
- **`@modules/users/tests/factories` (`createUser`, `PLAIN_PASSWORD`, `userRepository`)** — seeds accounts (including linking OAuth identities) and drives `badState` mutations.
- **`@infrastructure/observability/audit`** — mocked; the test asserts on `emitAuditEvent` calls and `recordAudit` routing.
- **`@infrastructure/runtime/demo-profile`** — toggles the fake OAuth provider on/off around the suite.
- **`../../audit` (`accountAuditActions`)** — provides the `AUTH_LOGIN` action constant used in assertions.
- **`../../metrics` (`authLoginTotal`)** — spied on to verify the shared Prometheus counter is incremented exactly once per successful login.

## Notes

- **`jest.mock` replacement vs. `jest.spyOn`:** The audit module is *replaced*, not spied on, because a CommonJS namespace import exposes each export as a non-configurable getter that `jest.spyOn` cannot redefine under all transforms this repo runs. The mock also re-wires `recordAudit` to call the replaced `emitAuditEvent` (since `recordAudit` closes over its own module's binding), so a single spy sees both direct and indirect emissions.
- **Refresh path is absent from the success table by design**, not by omission: it audits `AUTH_TOKEN_REFRESHED` and increments `auth_refresh_total`, a different invariant owned by `services/authentication.ts#refreshAccessToken`.
- **Refused password attempts still emit an `AUTH_LOGIN` failure event** (same as a wrong password) to avoid timing/oracle leaks. The contract asserts zero *successful* `AUTH_LOGIN` events, not zero `AUTH_LOGIN` events.
- **`auditSpy.mockClear()` is called between setup and the refusal under test** (especially for the refresh path, whose setup includes a genuine successful login) so setup events are not mistaken for the refusal's audit trail.
- The test uses the already-linked-identity OAuth branch (case 1 in `services/oauth.ts`); the first-login / identity-linking branch is not covered here.
