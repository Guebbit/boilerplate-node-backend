# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` API surface (profile update, password change, re-auth, sessions, email verification, export). Unlike unit suites that sweep generated payloads, these tests target state-dependent contract branches — a second account holding the same email, a revoked cookie, a spent token, someone else's session — that no random payload can produce. Every assertion runs `toSatisfyApiSpec()` to validate the response against the OpenAPI contract.

## Key elements

- **`loginWithCookie(overrides?)`** — Logs a user in via `POST /account/login` and returns `{ user, bearer, jwtCookie }`, preserving the refresh cookie that `authenticateAs` deliberately drops.
- **`readVerifyToken(userId)`** — Queries `userRepository.findByIdWithCredentials` to check whether an `EMAIL_VERIFY_TOKEN_TYPE` token (digest) is present at rest.
- **`verifyTokenFromMail()`** — Extracts the plaintext verify token from the last queued email's `linkUrl` (regex on `mailerPort.enqueueEmail.mock.calls`), since storage only holds a digest.
- **`cookieMaxAge(response, name)`** — Parses `Max-Age` from a named `set-cookie` header for refresh-tier assertions.
- **`MISSING_ID`** — A well-formed ObjectId guaranteed absent from the DB, used to hit the 404 branch (distinguishing it from 422).
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — Replaces `enqueueEmail` with a resolved no-op; required because `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes under swc.
- **`describe` blocks** — Cover `POST /account/login` (remember-me tiers), `PUT /account` (profile, email-change unverify, 409 conflict, 422), `POST /account/password`, `POST /account/reauth`, `POST /account/export`, and (truncated) session/verification scenarios.

## Relationships

- **`tests/support/contract.ts`** — Imported as a side-effect; registers the `toSatisfyApiSpec` custom matcher used throughout.
- **`tests/support/http.ts`** — Provides `api()` (supertest wrapper) and `authenticateAs()`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database before each test.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` and `PLAIN_PASSWORD` seed test accounts.
- **`src/modules/users/index.ts` / `src/modules/users/repository.ts`** — `userRepository.findByIdWithCredentials` is queried directly by `readVerifyToken`.
- **`src/modules/account/services/index.ts`** — Exports `EMAIL_VERIFY_TOKEN_TYPE` used in token-type matching.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked entirely; `enqueueEmail` calls are inspected to recover the plaintext verify token.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct` seeds a product for the export test.
- **`src/modules/orders/tests/fixtures.ts`** — `createOrder`, `toOrderItem` seed an order for the export test.

## Notes

- **422, never 401, on wrong password.** Both `/account/password` and `/account/reauth` assert 422 for a wrong current password. A 401 would be misread by client interceptors as "session expired" and force a logout on a still-valid session — the opposite of re-authentication's purpose.
- **Verify tokens are digests at rest.** The plaintext token exists only in the emailed link URL. The test must read it from the mocked mailer's call history, not from the DB.
- **`verifyTokenFromMail` bypasses `observePort`.** The standard `@tests/ports` helper clears the mock's call history on hand-out, which would erase the very call being read. This helper accesses `mock.calls` directly.
- **`authenticateAs` drops the refresh cookie.** Any test that needs the `jwt` cookie (logout, refresh, re-auth) must use the local `loginWithCookie` helper instead.
- **Listing assertions check IDs, not lengths.** Per the module doc, array responses are verified by confirming the expected IDs are present, preventing false passes from coincidental counts.
- **Cookie header is typed as `string` by supertest but is actually a list.** Both `loginWithCookie` and `cookieMaxAge` normalize with an `Array.isArray` guard.
