---
source: src/modules/account/tests/contract/api.contract.test.ts
sha256: b4368bfa419a8822c6026617a037bbbabec6389d2053ff51cfdcdc58235b8fb3
generated_at: 2026-10-29T02:50:47.451527+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` HTTP surface: profile update, password change, single-session logout, session listing, and email verification. Unlike the unit suites' generated-payload sweep, these tests exercise state-dependent branches (a second account holding the email, a revoked cookie, a spent token, someone else's session) that no random payload can set up. Listing assertions check concrete IDs, never just array lengths.

## Key elements

- **`readVerifyToken(userId)`** — returns the stored digest (`tokenHash`) for an account's email-verification token, or `undefined`; used to assert token presence/absence.
- **`verifyTokenFromMail()`** — extracts the plaintext `#token=` fragment from the last queued mail's `linkUrl`. Necessary because the token is a digest at rest and only exists in plaintext inside the emailed link.
- **`mailTo(to)`** — searches *all* queued mail for one addressed to `to` (an email-change request queues two mails: notice to the old address, link to the new).
- **`cookieMaxAge(response, name)`** — parses the `Max-Age` directive from a named `Set-Cookie` header.
- **`inJwtMode()`** — pins `NODE_SESSION_MODE=jwt` via `setEnvironment`; used only in cases that assert on the access/refresh pair itself.
- **`statusOfSession(cookie)`** — probes whether a session cookie is still alive: `POST /account/refresh` in `jwt` mode, `GET /account` in `cookie` mode.
- **`loginRemembering(remember?, email?)`** — creates a user, logs in with an optional remember tier, and returns `{ user, bearer, jwtCookie, headers }` where `headers` are mode-appropriate for subsequent requests.
- **`expectSessionCookies(response)`** — asserts both `__Host-session` and `isAuth` are set with no `Max-Age` and no `Expires`.
- **`describe('POST /account/login — remember me')`** — verifies tier-based cookie sizing, browser-session default (no Max-Age), short access-token window, and 422 for an undeclared tier.
- **`describe('the username ceiling')`** — enforces the 50-character username limit on signup (422 at 51, 201 at 50).
- **`describe('the "remember me" choice survives every re-mint')`** — confirms that refresh rotation and other re-mint paths preserve the originally chosen session-cookie type (browser-session stays browser-session).

## Relationships

- **`@infrastructure/adapters/mailer`** — Fully mocked via `jest.mock`; `enqueueEmail` is the sole observation point for all mail assertions. The real implementation is spread in via `jest.requireActual` so other exports remain intact.
- **`@infrastructure/adapters/logger`** — Imported as `logger`; available for log assertions (or suppression) within test cases.
- **`@infrastructure/i18n`** — `translator` imported; used to resolve localized strings asserted in response bodies.
- **`@kernel/config`** — `reauthWindowSeconds` imported; used to validate timing windows in reauth-related assertions.
- **`@modules/account/services`** — `EMAIL_VERIFY_TOKEN_TYPE` imported; passed to `tokenRowOf` to look up the correct token row.
- **`@modules/account/services/export`** — `settleInlineExports` called in `afterEach` to flush background export jobs before the sandbox is swept.
- **`@modules/account/session/config`** — `getSessionMode`, `getExpiryTime`, `getAccessExpiryTime` imported; all cookie-duration assertions compare against these source-of-truth accessors rather than raw env vars.
- **`@modules/account/repository`** — `sessionRepository` imported; used to inspect or manipulate session rows directly (e.g., revoking a session mid-test).
- **`@modules/account/tests/contract/support`** — `loginWithCookie` imported; a lighter login helper for cases that only need a cookie (no bearer).
- **`@modules/account/tests/factories`** — `plantToken`, `tokenRowOf` imported; write and read token rows in the test DB without going through the service layer.
- **`@modules/users/tests/factories`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`, `userRepository` imported; primary user-fabrication and password constants for every test in this file.
- **`@modules/users`** — `userService` imported; used where a test needs to act through the public service API (e.g., deleting a user to free an email).

## Notes

- **Mailer is replaced, not spied.** `jest.mock` is used because `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under `swc`. This matches the pattern used for audit/analytics ports elsewhere.
- **`verifyTokenFromMail` bypasses `observePort`.** The `@tests/ports` helper clears mock call history on hand-out, which would erase the very `enqueueEmail` call the helper needs to read. It therefore accesses `mailerPort.enqueueEmail.mock.calls` directly.
- **`mailTo` is a search, not a last-call read.** A `PATCH /account` email change queues two mails (old-address notice + new-address link); reading only `.at(-1)` would miss the notice.
- **`afterEach` settles exports then sweeps the sandbox.** `settleInlineExports()` flushes any in-flight background export job; `emptyFileSandbox()` removes the resulting files. Omitting either leaks state into the next test.
- **Tier assertions use `getExpiryTime`, not the raw env var.** The tier accessors carry code-side defaults, so an environment that never sets the variable still yields a correct expected value.
- **`cookie` mode tolerates a 1-second drift.** In `cookie` mode the row's remaining lifetime may already be a second less than the tier's nominal expiry, so the upper bound is `expected` and the lower bound is `expected - 5`.
