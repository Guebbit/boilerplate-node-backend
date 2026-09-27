---
source: src/modules/account/tests/contract/api.contract.test.ts
sha256: f8593191bf408c06d2e94e15b3751ffc5dfdc9193ba82694449f09347049fe96
generated_at: 2026-09-27T14:33:02.485834+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` HTTP surface: login (with remember-me tiers), profile update (PUT full-replace and PATCH partial), password change, email verification (request + confirm), sessions listing, and single-session logout. These tests target scenario branches that depend on specific state (a second account owning the email, a revoked cookie, a spent token, a time-sensitive step-up window) that generated-payload unit sweeps cannot exercise.

## Key elements

- **`loginWithCookie`** — helper that creates a user, logs in via `POST /account/login`, and returns both the bearer token and the `jwt` cookie (needed because `authenticateAs` drops the cookie).
- **`loginRemembered`** — variant of the above that passes `remember: 'short'` so the refresh cookie outlives clock advances used in step-up tests.
- **`staleButRefreshedBearer`** — advances the fake clock past `REAUTH_TIME_SENSITIVE`, calls `/account/refresh`, and returns the renewed bearer token (simulates a long-lived-but-stale session).
- **`verifyTokenFromMail`** — extracts the plaintext verify token from the `?token=` param of the last queued mail's `linkUrl`. Reads `mailerPort.enqueueEmail` mock calls directly (not via `observePort`, which would clear history).
- **`mailTo`** — searches all queued mails for one addressed to a given recipient (a single `PATCH /account` email change enqueues two mails).
- **`readVerifyToken`** — checks presence (not value) of a stored email-verify token, since it is a `hashToken` digest at rest.
- **`cookieMaxAge`** — parses `Max-Age` seconds from a named `Set-Cookie` header.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces the module (not spies on it) because `enqueueEmail` is a non-configurable getter under swc/CJS; the mock resolves `undefined` and records calls.
- **Test blocks** — `POST /account/login` (remember tiers, invalid tier 422), `PUT /account` (full-replace semantics, required fields), step-up auth (re-cased email vs. genuine change), `PATCH /account` (partial update, pending email flow), and (in truncated portion) password change, verify-confirm, sessions, and logout.

## Relationships

- **`@infrastructure/adapters/mailer`** — module-mocked; all email assertions go through its recorded `enqueueEmail` calls.
- **`@infrastructure/adapters/logger`** — imported (likely spied on in the truncated portion to assert audit logging).
- **`@infrastructure/http/response`** — `ResponseSuccess` type used for response-shape assertions.
- **`@kernel/middlewares/authorizations`** — `REAUTH_TIME_SENSITIVE` constant drives the step-up time-window tests.
- **`@modules/account/services`** — `EMAIL_VERIFY_TOKEN_TYPE` discriminant for reading stored tokens.
- **`@modules/account/session/config`** — `getExpiryTime` / `RefreshTokenExpiryTime` used to assert cookie `Max-Age` matches the tier's code-side default.
- **`@modules/users/tests/factories`** — `createUser`, `userRepository`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD` for fixture setup and password assertions.
- **`@modules/users`** — `TokenType`, `userService` (and transitively `users/model`, `users/repository`, `users/service`) for token-type checks and service-level assertions.
- **`@modules/products/tests/factories`** — `createProduct` for populating orders in multi-tenant or role-scenario setups.
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem` for the same reason.
- **`@modules/payments`** — `createIntent` to seed a payment context relevant to account-role tests.

## Notes

- The mailer mock is a full module replacement, not a `jest.spyOn`. The file comments explain this is a swc/CJS interop constraint: the namespace object's getters are non-configurable.
- `verifyTokenFromMail` reads mock calls directly rather than through the shared `observePort` helper because that helper clears call history on hand-out, which would destroy the very call being read.
- `mailTo` is a *search* over all calls, not "last call" — a single email-change request enqueues two mails (notice to old, link to new).
- Step-up tests use `remember: 'short'` deliberately: an unqualified login gives the refresh token the same short TTL as the access token (`NODE_TOKEN_ACCESS_TIME`), which would expire during the clock advance and mask the freshness gate behind a plain 401.
- `PUT /account` is treated as a full-replace (RFC 9110 §9.3.4): omitted optional fields are cleared, and `email` + `username` are required.
- Italian locale JSON files (`it.json`) are imported for i18n error-message assertions (visible in the import list; used in the truncated portion).
- The file ends with `setupTestDb()` at module scope, so the DB is torn down per test-file run, not per test.
