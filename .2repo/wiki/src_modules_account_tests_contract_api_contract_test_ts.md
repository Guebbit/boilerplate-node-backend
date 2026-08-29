# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Scenario-level contract tests for the self-service `/account` surface (profile update, password change, single-session logout, sessions listing, email verification). These endpoints require state that a generated payload cannot express—another account holding an email, a revoked cookie, a spent token, a session owned by someone else—so they are tested here as multi-step scenarios rather than in the auto-derived request sweep.

## Key elements

- **`MISSING_ID`** — A syntactically valid ObjectId that is guaranteed absent, used to exercise the 404 branch distinctly from the 422 branch.
- **`loginWithCookie(overrides?)`** — Creates a user, POSTs `/account/login`, and returns `{ user, bearer, jwtCookie }`. Unlike `authenticateAs`, it retains the `set-cookie` header so cookie-dependent endpoints (logout, refresh, sessions) can be exercised.
- **`readVerifyToken(userId)`** — Fetches the stored email-verification token for a user via `userRepository.findByIdWithCredentials`.
- **`cookieMaxAge(response, name)`** — Extracts and returns the `Max-Age` (seconds) of a named cookie from a response's `set-cookie` header.
- **`describe` blocks** — Cover: `POST /account/login` (remember-me tiers), `PUT /account` (profile/email update + conflict), `POST /account/password`, `POST /account/logout` (cookie revocation), `GET /account/sessions` (current-flag, `lastUsedAt` lifecycle), and email verification (truncated).

## Relationships

- **`tests/support/contract.ts`** — Side-effect import that registers the `toSatisfyApiSpec()` matcher used in every assertion.
- **`tests/support/http.ts`** — Provides the `api()` supertest wrapper and the `authenticateAs()` shortcut for bearer-only auth.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a clean database before tests run.
- **`src/modules/users/tests/factory.ts`** — `createUser()` and `PLAIN_PASSWORD` are the standard fixtures for creating test users.
- **`src/modules/users/index.ts`** → **`src/modules/users/repository.ts`** — `userRepository.findByIdWithCredentials` is used to read the stored verify token directly from the DB.
- **`src/modules/account/services/index.ts`** — Exports `EMAIL_VERIFY_TOKEN_TYPE`, the discriminator used when locating the verify token in the user's token list.
- **`src/modules/products/tests/factory.ts`** — `createProduct` is imported (available for any test that needs product-linked state, e.g. verifying that unrelated product data doesn't leak into account responses).

## Notes

- **`set-cookie` type coercion:** supertest types every header as `string`, but `set-cookie` is semantically a list. `loginWithCookie` and `cookieMaxAge` both guard with `Array.isArray` before iterating.
- **Cookie vs. bearer distinction is intentional:** `authenticateAs` drops the cookie by design. Any test that needs cookie semantics (logout, refresh, sessions `current` flag) must go through `loginWithCookie` instead.
- **`lastUsedAt` absent-then-present is one test on purpose:** splitting it would let each half pass independently even if the field never changed. The combined assertion is the actual property under test.
- **Wrong-but-nonempty listings must not pass:** the header comment states that listing assertions should check IDs, not just `.length`. The visible sessions tests check `toHaveLength(1)` plus the `current` flag; more complex listing scenarios (in the truncated portion) are expected to assert on IDs.
- **422 vs 401 for wrong current password:** the password-change test explicitly asserts 422, not 401, because the caller is already authenticated—the error is about the *value*, not the *identity*.
