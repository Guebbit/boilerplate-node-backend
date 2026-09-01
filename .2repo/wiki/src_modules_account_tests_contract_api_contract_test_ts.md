# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` HTTP surface (login, profile update, password change, single-session logout, session listing, email verification). They exist because these endpoints have state-dependent branches—duplicate-email conflicts, revoked cookies, spent tokens, cross-session access—that a generated-payload unit sweep cannot exercise. Assertions check specific IDs and field values, not merely response lengths.

## Key elements

- **`loginWithCookie(overrides?)`** — Creates a user, POSTs `/account/login`, and returns `{ user, bearer, jwtCookie }`. Unlike `authenticateAs`, it preserves the `jwt` refresh cookie in addition to the bearer token.
- **`readVerifyToken(userId)`** — Queries `userRepository.findByIdWithCredentials` and extracts the token whose `type` is `EMAIL_VERIFY_TOKEN_TYPE`.
- **`cookieMaxAge(response, name)`** — Parses the `Max-Age` attribute off a named `Set-Cookie` header, returning seconds or `undefined`.
- **`MISSING_ID`** — A syntactically valid ObjectId guaranteed to be absent, used to exercise the 404 branch distinctly from the 422 branch.
- **`describe` blocks** — Cover: `POST /account/login` (remember-me tier, default tier, invalid tier), `PUT /account` (self-update, email change → unverified, duplicate email → 409, invalid body → 422, unauth → 401), `POST /account/password` (success, wrong current → 422, unauth → 401), `POST /account/logout` (revokes specific cookie, no-op without cookie), `GET /account/sessions` (current flag, bearer-only flag, `lastUsedAt` lifecycle, unauth → 401), `DELETE /account/sessions/{sessionId}` (targeted revocation).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import; installs the `toSatisfyApiSpec()` matcher used in every assertion. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called once at module scope to reset the database before the suite runs. |
| `tests/support/http.ts` | Provides `api()` (supertest wrapper) and `authenticateAs(role)` for quick bearer-token auth. |
| `src/modules/users/tests/fixtures.ts` | `createUser` and `PLAIN_PASSWORD` are the standard user-creation helpers. |
| `src/modules/products/tests/fixtures.ts` | `createProduct` is imported (used in truncated portion, likely for ownership-related assertions). |
| `src/modules/users/index.ts` | Re-exports `userRepository`, used to read stored tokens directly from the DB. |
| `src/modules/users/repository.ts` | `userRepository.findByIdWithCredentials` backs the `readVerifyToken` helper. |
| `src/modules/account/services/index.ts` | Exports `EMAIL_VERIFY_TOKEN_TYPE`, the discriminator for locating the verify token in a user's token list. |

## Notes

- **`authenticateAs` drops the refresh cookie.** It returns only the bearer token. Any test that needs the `jwt` cookie (logout, refresh, session listing) must use `loginWithCookie` instead.
- **`set-cookie` typing quirk.** Supertest types every header as `string`, but `set-cookie` arrives as an array. Both helpers handle the array-or-string case defensively.
- **`toSatisfyApiSpec()`** is the single contract assertion; it validates shape, status, and error envelope against the API spec. Every test calls it after the status check.
- **404 vs 422 distinction.** `MISSING_ID` is a well-formed ObjectId that simply doesn't exist, so the server returns 404. A malformed ID would hit the 422 validation branch. Tests are careful to hit the right one.
- **`lastUsedAt` is intentionally asserted in a single test** (absent before use, present after a refresh call) so that a regression can't silently shift one half without the other.
- **The file is truncated** in the source provided; the visible `DELETE /account/sessions/{sessionId}` block and any email-verification `describe` block are only partially present.
