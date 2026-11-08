---
source: src/modules/account/tests/contract/lifecycle.contract.test.ts
sha256: ad66ec59a85df5a24eea027a6473266c9b14fea770fb59da4bb38208b3efcc4f
generated_at: 2026-11-08T04:31:34.449291+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/lifecycle.contract.test.ts

## Purpose

Contract tests for account-lifecycle endpoints that `api.contract.test.ts` does not cover: scheduled account deletion and restore, password-reset request (including anti-enumeration and greeting-security), logout-everywhere, and password breach-check. Each success flow is driven for real by reading the one-time token back out of the mocked mail queue, so the assertion body is what a client would actually receive.

## Key elements

- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a `jest.fn()` while preserving the rest of the module, allowing tests to inspect queued mails.
- **`queued(template: string): Promise<void>`** — polls until a mail with the given template name appears in the mock's call history.
- **`mailedToken(template: string): string`** — extracts the `#token=…` fragment from the newest queued mail's `linkUrl`.
- **`mailedGreeting(template: string): string`** — reads the `greeting` field from the newest queued mail of a template.
- **`describe('DELETE /account and POST /account/restore')`** — asserts 202 on delete, DB `deletedBy` set, 204 on restore, DB `deletedAt` cleared; 422 for a bogus token.
- **`describe('POST /account/password/reset')`** — asserts 204 + queued mail for a known address; asserts identical observable response (status, body minus `instance`, `set-cookie`, `etag`) and *no* queued mail for an unknown address; 422 for a non-email body.
- **`describe('the name in a mailed greeting')`** — security: verified user's username appears in the reset greeting; unverified user and signup-verification mails must show the generic `"Hello!"`.
- **`describe('DELETE /account/sessions')`** — asserts 204 and that all session rows for the user are gone.
- **`describe('POST /account/password/check')`** — asserts 200 for a breached password, 200 for a clean one, 422 for empty.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — mocked at module level; tests read `enqueueEmail.mock.calls` to extract tokens and greetings.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (seeds test users with configurable `verifiedAt`, `username`) and `userRepository`.
- **`src/modules/users/repository.ts`** — `userRepository.findById` is used to assert post-request DB state (`deletedBy`, `deletedAt`).
- **`src/modules/account/tests/factories.ts`** — provides `sessionRowsOf` to query session rows for a user ID.
- **`tests/support/contract.ts`** — imported as a side-effect; presumably registers global contract-test matchers or reporters.
- **`tests/support/eventually.ts`** — `eventually` powers the `queued` poller and the anti-enumeration "no mail within 200 ms" assertion.
- **`tests/support/http.ts`** — `api()` builds Supertest requests; `authenticateAs` creates a user and returns a bearer token.
- **`tests/support/problem.ts`** — `withoutInstance` strips the `instance` field so error-body comparisons ignore the per-request identifier.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called once at module scope to initialise the test database.

## Notes

- The `queued` helper exists because `POST /account/password/reset` intentionally responds **before** the mail is enqueued; response timing must not distinguish registered from unregistered addresses.
- `mailedToken` uses `findLast` on the mock's call array and a regex on `linkUrl`; it throws if no token is found, which surfaces as a clear test failure.
- The anti-enumeration comparison uses `withoutInstance` on the body and also checks `set-cookie` and `etag` headers, but explicitly excludes `RateLimit-*` headers (they vary per caller by design).
- The greeting tests are a security guard: the `username` field is a free-form display name, so printing it in a mail to an unverified address would allow an attacker to inject arbitrary text (phishing) from the shop's own domain.
