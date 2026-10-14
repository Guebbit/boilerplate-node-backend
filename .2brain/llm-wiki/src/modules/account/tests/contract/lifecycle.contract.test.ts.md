---
source: src/modules/account/tests/contract/lifecycle.contract.test.ts
sha256: c24a8a2718cdd10b3ca25ff865d56a31743a179aa6fd65fac50c51fbc78fe9d5
generated_at: 2026-10-14T09:04:03.168133+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/lifecycle.contract.test.ts

## Purpose

Contract tests for account-lifecycle endpoints that `api.contract.test.ts` does not cover: two-step account deletion, password-reset request, logout-all, and the live breach check. Each token-carrying flow is driven end-to-end by reading the one-time token back out of the mocked mail queue, so the assertions validate the exact payload a real client would receive.

## Key elements

- **`queued(template)`** — polls until a mail of the given template appears in the mocked `enqueueEmail` call log.
- **`mailedToken(template)`** — extracts the `#token=` fragment from the newest queued mail's `linkUrl`; throws if absent.
- **`mailedGreeting(template)`** — returns the `greeting` field of the newest queued mail (empty string if none).
- **`describe('DELETE /account … delete-confirm')`** — verifies the two-step deletion happy path, a 422 for an unissued token, and a 401 without a session.
- **`describe('POST /account/reset')`** — verifies the reset mail is sent, that an unknown address gets the identical 200 response with **no** mail (anti-enumeration), and a 422 for a malformed email.
- **`describe('the name in a mailed greeting')`** — security tests: a verified address's chosen `username` appears in the reset mail; an unverified address and all signup verification mails get only the generic `"Hello!"`, preventing caller-controlled text from reaching a stranger's inbox.
- **`describe('POST /account/logout-all')`** — asserts all session rows for the account are removed.
- **`describe('POST /account/password/check')`** — verifies 200 for breached and unbreached candidates, 422 for an empty string.
- **Mailer mock** — `jest.mock` keeps the real module but replaces `enqueueEmail` with a `jest.fn()` that resolves `undefined`; cleared in `beforeEach`.

## Relationships

- **`tests/support/contract.ts`** — side-effect import that registers contract-test matchers/globals the suite relies on.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-test database before any suite runs.
- **`tests/support/eventually.ts`** — `eventually()` is the polling primitive behind `queued()` and the 200 ms "let detached work finish" guard in the enumeration test.
- **`tests/support/http.ts`** — provides `api()` (supertest-style request builder) and `authenticateAs()` (login + bearer extraction).
- **`src/modules/users/tests/factories.ts`** — `createUser()` fabricates users; `userRepository.findById` is used to assert the account row is gone after confirm-delete.
- **`src/modules/account/tests/factories.ts`** — `sessionRowsOf()` queries the session table so the logout-all test can assert an empty result.
- **`src/infrastructure/adapters/mailer.ts`** — the only mocked external port; the test reads its call arguments to retrieve tokens and greeting text.

## Notes

- Token extraction depends on the `linkUrl` containing a `#token=<value>` fragment. A change to the URL scheme (e.g., query-string token) breaks `mailedToken` silently.
- The "no account enumeration" test deliberately inserts a 200 ms wait (`eventually(() => false, 200)`) so that any async mail dispatch has time to fire before the assertion; removing it would turn a real bug into a flaky "not yet queued" false positive.
- The greeting-security tests are the only place in the suite that inspects mail *body* content (as opposed to token presence), and they encode a product rule: user-supplied `username` is rendered only when the address has been verified.
- `beforeEach` clears the mailer mock, so each test sees only its own queued mails — do not add cross-test mail assertions without a fresh clear.
