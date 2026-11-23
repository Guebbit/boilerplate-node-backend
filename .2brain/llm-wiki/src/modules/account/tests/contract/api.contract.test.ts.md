---
source: src/modules/account/tests/contract/api.contract.test.ts
source_sha256: 8337a4ae89598cb8d68324ff11b9a9e82bc76acb534f81458a5c3f743e2143d0
context_sha256: 3880077c49d5fbafd29f0d8daeb7034def69ddbd4392e06f052ec4d16427e818
generated_at: 2026-11-22T03:49:52.988654+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the self-service `/account` HTTP surface: profile update, password change, single-session logout, sessions listing, and email verification. Unlike the unit suites' generated-payload sweeps, these are scenario tests, because the branches under test depend on state a random payload can't create (a second account holding an email, a revoked cookie, a spent token, someone else's session). Listing assertions check IDs, not just lengths.

## Key elements
- `setupTestDb()` and an `afterEach` that calls `settleInlineExports()` and then `emptyFileSandbox`. Background-built exports finish before the sandbox is swept.
- `jest.mock('@infrastructure/adapters/mailer', ...)`: replaces `enqueueEmail` with a resolved mock. `jest.spyOn` can't redefine the non-configurable CommonJS namespace getter under swc.
- `readVerifyToken(userId)`: reports whether the account holds an email-verify token row. Only presence is checkable, because the token is stored as a digest.
- `verifyTokenFromMail()`: pulls the plaintext verify token from the last queued mail's `linkUrl` (`#token=` fragment). It reads `mailerPort.enqueueEmail` directly, because `observePort` clears mock history. It throws if no token is found.
- `mailTo(to)`: finds the queued mail addressed to a given recipient. It searches rather than taking the last call, since an email change queues two mails: a notice to the old address and a link to the new one.
- `cookieMaxAge(response, name)`: parses `Max-Age` from a response's `Set-Cookie`.
- `inJwtMode()`: pins `NODE_SESSION_MODE=jwt` for cases about the access/refresh pair.
- `statusOfSession(cookie)`: probes whether a session is alive. In `jwt` mode it uses `POST /account/refresh`, and in `cookie` mode it uses `GET /account`.
- `loginRemembering(remember?, email?)`: logs in with an optional remember tier. It returns `user`, `bearer`, `jwtCookie`, and mode-appropriate `headers`.
- `expectSessionCookies(response)`: asserts that `__Host-session` and `isAuth` are set with no `Max-Age` and no `Expires`.
- `describe` blocks visible in this part of the file:
  - `POST /account/login — remember me`: cookie sizing by tier, browser-session cookies when no tier is given, a short access-token window, and 422 for an undeclared tier before credentials are checked.
  - `the username ceiling`: signup is refused at 51 characters and accepted at exactly 50.
  - `the "remember me" choice survives every re-mint`: starts with signup getting browser-session cookies.

## Relationships
- `@modules/users/tests/factories` supplies `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD` and `userRepository`. `src/modules/users/repository.ts` is a neighbor, but it is reached through the factories export here.
- `src/modules/account/tests/factories.ts` supplies `plantToken` and `tokenRowOf`, used to seed and read token rows.
- `src/modules/account/tests/contract/support.ts` supplies `loginWithCookie`.
- `src/modules/account/services/index.ts` supplies `EMAIL_VERIFY_TOKEN_TYPE`.
- `src/modules/account/services/export.ts` supplies `settleInlineExports`.
- `src/modules/account/session/config.ts` supplies `getSessionMode`, `getExpiryTime` and `getAccessExpiryTime`, which the tests use to compute expected cookie and token lifetimes.
- `src/modules/account/repository.ts` supplies `sessionRepository`.
- `src/modules/users/friends/account.ts` supplies `accountUserService`.
- `src/infrastructure/adapters/mailer.ts` is mocked, and its `enqueueEmail` calls are inspected.
- `src/infrastructure/adapters/logger.ts` supplies `logger`.
- `src/infrastructure/i18n/index.ts` supplies `translator`.
- `src/kernel/config.ts` supplies `reauthWindowSeconds`.
- `src/types/index.ts` supplies `RememberTier`.
- Test helpers come from the `@tests/*` aliases (`http`, `cookies`, `clock`, `environment`, `ids`, `file-sandbox`, `account-export`, `setup-test-db`, `contract`).

## Notes
- The suite runs in whichever session mode is configured. `npm run test:contract:cookie` runs everything in `cookie` mode, so helpers branch on `getSessionMode()`.
- In `jwt` mode, the next request needs both a bearer and the refresh cookie. In `cookie` mode, the cookie alone authenticates, and sending a bearer would change the response to a bearer-style one with no cookie.
- The `max-age` assertions allow a few seconds of slack (`expected - 5`) in `cookie` mode, where the remaining row lifetime is counted.
- Tokens are hashed at rest, so tests obtain the usable plaintext token only from the mocked mail.
