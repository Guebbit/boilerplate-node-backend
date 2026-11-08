---
source: src/modules/account/tests/contract/api.contract.test.ts
sha256: b4368bfa419a8822c6026617a037bbbabec6389d2053ff51cfdcdc58235b8fb3
generated_at: 2026-11-08T04:31:01.053666+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract-level integration tests for the self-service `/account` HTTP surface (profile update, password change, single-session logout, sessions listing, email verification, login with "remember me" tiers, and username limits). Unlike the unit suites that sweep generated random payloads, these tests target state-dependent contract branches—duplicate emails, revoked cookies, spent tokens, foreign sessions—that no random payload can produce. Listing assertions check concrete IDs, not just array lengths.

## Key elements

- **Mailer mock (`jest.mock`)** — Replaces `enqueueEmail` with a resolved `jest.fn()`. The mailer is fully replaced (not spied) because the CommonJS namespace getter is non-configurable under swc; spying cannot redefine it.
- **`readVerifyToken(userId)`** — Reads `tokenHash` from the token table to assert *presence* of a verify token (only a digest is stored).
- **`verifyTokenFromMail()`** — Extracts the plaintext `#token=` fragment from the last queued mail's `linkUrl`. Necessary because the token is a hash at rest; the only plaintext copy is the emailed link.
- **`mailTo(to)`** — Searches *all* queued mails for one addressed to `to`, since a `PATCH /account` email change queues two mails (notice to old + link to new).
- **`cookieMaxAge(response, name)`** — Parses the `Max-Age` directive from a `Set-Cookie` header.
- **`inJwtMode()`** — Pins `NODE_SESSION_MODE=jwt` for tests that specifically exercise the access/refresh token pair.
- **`statusOfSession(cookie)`** — Probes whether a session is still alive: `POST /account/refresh` in jwt mode, `GET /account` in cookie mode. Returns the HTTP status.
- **`loginRemembering(remember?, email?)`** — Creates a user, logs in (optionally with a tier), and returns the user, bearer token, `__Host-session` cookie, and the correct `Authorization`/`Cookie` header pair for the active session mode.
- **`expectSessionCookies(response)`** — Asserts both `__Host-session` and `isAuth` cookies are present with no `Max-Age` or `Expires` (browser-session semantics).
- **`afterEach` hook** — Awaits `settleInlineExports()` then calls `emptyFileSandbox()` to clean up background export artifacts.
- **Test suites** (visible): *"POST /account/login — remember me"*, *"the username ceiling"*, *"the 'remember me' choice survives every re-mint"* (truncated).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Mocked module; `enqueueEmail` is the sole observation point for all email-sending assertions.
- **`src/modules/account/session/config.ts`** — `getSessionMode` drives mode-conditional helpers; `getExpiryTime` / `getAccessExpiryTime` supply the expected cookie/token lifetimes.
- **`src/modules/account/tests/factories.ts`** — `tokenRowOf` backs `readVerifyToken`; `plantToken` (truncated section) seeds token rows for verification tests.
- **`src/modules/account/services/index.ts`** — `EMAIL_VERIFY_TOKEN_TYPE` constant used to scope token lookups.
- **`src/modules/account/services/export.ts`** — `settleInlineExports` awaited in `afterEach` to let background export jobs finish before the sandbox is cleared.
- **`src/modules/account/repository.ts`** — `sessionRepository` used (truncated section) to inspect session rows directly.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`, `userRepository` supply user fixtures and state.
- **`src/modules/users/index.ts`** — `userService` imported for user-level operations (truncated section).
- **`src/infrastructure/i18n/index.ts`** — `translator` imported, used in truncated assertions on localised messages.
- **`src/kernel/config.ts`** — `reauthWindowSeconds` imported for reauth-window timing assertions (truncated section).
- **`src/modules/account/tests/contract/support.ts`** — `loginWithCookie` helper (truncated section).
- **`src/infrastructure/adapters/logger.ts`** — `logger` imported (used in truncated section, likely to assert log calls).

## Notes

- The mailer is **replaced**, not spied on. `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under swc.
- `verifyTokenFromMail` reads `mailerPort.enqueueEmail` directly instead of through the `observePort` helper because that helper **clears** the mock's call history on hand-out, which would erase the very call being read.
- `mailTo` is a search over all calls, not a last-call read, because a single email-change request queues **two** mails.
- Tests run under both `NODE_SESSION_MODE=cookie` and `NODE_SESSION_MODE=jwt`; only tests that specifically need the access/refresh pair call `inJwtMode()`. The `npm run test:contract:cookie` script runs the whole file in cookie mode.
- `setupTestDb()` is called at module top level (not in `beforeAll`), so the test database is ready before any import-side-effect runs.
