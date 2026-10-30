---
source: src/modules/account/tests/contract/code-delivery.contract.test.ts
sha256: 595668b021d0e18ea7a5c3840e960f945840ed4f35a9cdd20e92cbaea620026c
generated_at: 2026-10-29T02:51:03.106301+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/code-delivery.contract.test.ts

## Purpose

Contract test verifying the email code-delivery surface (2FA setup/confirm/send and step-up reauth send) under two deployment conditions that the other account suites mask: a `log` mail transport where no recipient can read mail, and the shared hourly send budget that both the 2FA send and the step-up send draw from.

## Key elements

- **`mockOutbox`** – Module-level array that collects every `enqueueEmail` call (`{ template, data }`). Cleared in `beforeEach`. Used to extract the one-time code for the confirm step.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – Replaces `enqueueEmail` with a spy that pushes into `mockOutbox` and resolves, so no real mail is sent and codes are readable from the array.
- **`setupTestDb()`** – Initialises the in-memory test database for the suite.
- **`describe('a deployment whose mail reaches no person')`** – Sets `NODE_MAIL_TRANSPORT: 'log'` and asserts:
  - `POST /account/2fa/methods/email/setup` returns **404** with the same body as a genuinely unknown method (e.g. `/nonsense/setup`), confirming the factor is hidden.
  - For a passwordless (OAuth-only) account, `GET /account/reauth` lists **zero methods** and `POST /account/reauth/methods/email/send` returns **422**.
- **`describe('the send budget shared by 2FA and step-up')`** – Sets `NODE_MAIL_TRANSPORT: 'outbox'` and, inside `withEnvironmentOverrides({ NODE_MFA_ACCOUNT_SEND_MAX: '2' })`, arms a 2FA method (setup + confirm, which does *not* spend budget), then fires three sends: two succeed (200) and the third is rejected (429), proving both routes draw from the same counter.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported for side-effect contract-test setup (e.g. shared `expect` extensions). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database before any test runs. |
| `tests/support/environment.ts` | `setEnvironment` pins `NODE_MAIL_TRANSPORT`; `withEnvironmentOverrides` scopes `NODE_MFA_ACCOUNT_SEND_MAX` to a single test. |
| `tests/support/http.ts` | `api()` and `loginBearer()` build the request helpers and authenticate as the created user. |
| `tests/support/problem.ts` | `withoutInstance` strips the `instance` field from RFC 7807 problem bodies so equality checks ignore the opaque URL. |
| `src/modules/users/tests/factories.ts` | `createUser` (email-verified user) and `userRepository.create` (passwordless OAuth user) supply test fixtures. |
| `src/modules/account/tests/factories.ts` | `mintSession` issues a bearer token with a chosen `amr` array for authenticated requests. |
| `src/modules/users/repository.ts` | Reached indirectly through `userRepository` in the users factories; no direct import here. |

## Notes

- The `log`-transport describe block never inspects `mockOutbox`; its whole point is that the *endpoint* is absent (404) or unavailable (422), so mail delivery is irrelevant.
- The budget test extracts the code via `mockOutbox.findLast(…)` filtered on the `account.two-factor-code` template — the setup step's email. The confirm step does not enqueue a new email.
- The comment "Arming does not spend the send budget" is an intentional invariant under test: `setup` + `confirm` are free; only the two `/send` routes decrement the counter.
- The test uses `loginBearer` (email/password login) in the `log`-transport block but `mintSession` (direct token mint) in the budget block, because the budget user has no password.
