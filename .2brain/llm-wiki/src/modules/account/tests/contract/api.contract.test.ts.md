---
source: src/modules/account/tests/contract/api.contract.test.ts
sha256: 26f5efed664470c6d59b29fa9e58047eca0ed4454b449f85a396794f59572d20
generated_at: 2026-09-23T18:12:32.737248+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the self-service `/account` API surface (profile update, password change, session management, email verification). They target scenario-level branches that require specific state — a second account holding the email, a revoked cookie, a spent one-time token — which random-payload unit sweeps cannot produce. Assertions check concrete values (IDs, messages, cookie attributes), not just lengths or status codes.

## Key elements

- **`setupTestDb()`** – boots a per-suite database (from `@tests/setup-test-db`).
- **`jest.mock('@infrastructure/adapters/mailer')`** – _replaces_ the mailer module (not a spy) so `enqueueEmail` is a `jest.fn()`; required because the plaintext verify token only exists in the emailed link.
- **`MISSING_ID`** – a syntactically valid ObjectId guaranteed not to exist, used to exercise the 404 branch specifically.
- **`loginWithCookie(overrides?)`** – logs in via `POST /account/login` and returns both the bearer token _and_ the `jwt` cookie; needed for flows (`logout`, `refresh`, `current`) that depend on the session cookie, which `authenticateAs` deliberately drops.
- **`readVerifyToken(userId)`** – checks _presence_ of a verify-token digest in the user's `tokens` array (the stored value is a hash, not the usable token).
- **`verifyTokenFromMail()`** – extracts the plaintext `?token=` query parameter from the last queued mail's `linkUrl`; reads `mailerPort.enqueueEmail` mock calls directly (not via `observePort`, which clears history).
- **`mailTo(to)`** – searches all queued mail for the envelope addressed to `to`; a genuine `PUT /account` email change queues _two_ mails, so "last call" would miss the notice to the old address.
- **`cookieMaxAge(response, name)`** – parses the `Max-Age` directive from the `Set-Cookie` header for the named cookie.
- **`describe('POST /account/login — remember me')`** – asserts `jwt` / `isAuth` cookie `Max-Age` matches the tier's expiry from `getExpiryTime`, and that an undeclared tier yields 422 before credential check.
- **`describe('PUT /account')`** – profile rename, email pending flow (holds new address as `pendingEmail`), cancel-pending by restating current address, 409 on taken email, 422 on invalid body.
- **`describe('POST /account/reset-confirm')`** – verifies that a weak password returns the field-specific locale message (`itUsers.users['field-password-min']`) rather than the generic size message.
- **`describe('POST /account/password')`** – confirms 200 + re-login with the new password works.

## Relationships

| Neighbor                                                    | Interaction                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/users/tests/factories.ts`                      | `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `WEAK_PASSWORD`, `userRepository` used for fixture setup and token-state inspection. |
| `src/modules/users/index.ts`                                | `TokenType` (for `user.tokenAdd`) and `userService` imports.                                                                                 |
| `src/modules/account/services/index.ts`                     | `EMAIL_VERIFY_TOKEN_TYPE` constant for token-type filtering.                                                                                 |
| `src/modules/account/session/config.ts`                     | `getExpiryTime` / `RefreshTokenExpiryTime` — the same accessor the app uses to size cookies; tests assert against it, not raw env vars.      |
| `src/infrastructure/adapters/mailer.ts`                     | Fully mocked at module level; `enqueueEmail` call history is the observation channel for emailed tokens.                                     |
| `src/infrastructure/adapters/logger.ts`                     | Imported (likely for error-path logging assertions or suppression).                                                                          |
| `src/infrastructure/http/response.ts`                       | `ResponseSuccess` type import for response-shape assertions.                                                                                 |
| `src/modules/products/tests/factories.ts`                   | `createProduct` for order-related fixtures.                                                                                                  |
| `src/modules/orders/tests/factories.ts`                     | `createOrder`, `toOrderItem` for order fixtures tied to the account.                                                                         |
| `src/modules/payments/index.ts` / `services/intent.ts`      | `createIntent` for payment-intent fixtures.                                                                                                  |
| `src/types/index.ts`                                        | `Payment` type import.                                                                                                                       |
| `src/modules/users/repository.ts`, `model.ts`, `service.ts` | Underlying domain logic exercised through the HTTP API in these contract tests.                                                              |

## Notes

- **Mailer mock is a replacement, not a spy.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under SWC; the module is replaced via `jest.mock` with a spread of `requireActual` plus the overridden `enqueueEmail`.
- **Verify tokens are one-way digests at rest.** The only way to obtain the plaintext token is to read it out of the queued mail's `linkUrl`. This is why the mailer must be mocked rather than simply observed.
- **`mailTo` searches all calls, not just the last.** An email change triggers two queued mails (notice to old address + link to new address); reading only `.at(-1)` would miss the first.
- **`verifyTokenFromMail` bypasses `observePort`.** That helper clears the mock's call history on hand-out, which would erase the very call being read.
- **Cookie expiry assertions go through `getExpiryTime`.** The tiers carry code-side defaults, so asserting against the accessor (not a raw env var) keeps the test correct even when the environment never sets the variable.
- **`toSatisfyApiSpec()`** (from `@tests/contract`) validates response shape against the OpenAPI contract on every assertion that matters, in addition to the targeted value checks.
