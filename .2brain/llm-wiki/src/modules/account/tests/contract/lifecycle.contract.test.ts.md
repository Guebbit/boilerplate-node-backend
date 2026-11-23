---
source: src/modules/account/tests/contract/lifecycle.contract.test.ts
source_sha256: 5986dfcbfef47a42544384e9293cd3369027b0cfdd343daf8b841de4bc04f764
context_sha256: 4ae3b5087602d2737380c46720d700d3d6118063ddb340e30a7a0e74db364842
generated_at: 2026-11-22T03:50:10.572923+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/lifecycle.contract.test.ts

## Purpose
Contract tests for the account-lifecycle endpoints that `api.contract.test.ts` doesn't cover: scheduled account deletion and restore, password-reset request, logging out of all sessions, the password breach check, and the expired-token sweep (named in the module doc). Each success path is driven for real, with the mailed token read back from the mocked mail queue, so the response checked against the spec is what a client would actually receive.

## Key elements
- **`jest.mock('@infrastructure/adapters/mailer')`**: keeps the real module but replaces `enqueueEmail` with a resolved `jest.fn()`, so tests can inspect queued mails. The mock is cleared in `beforeEach`.
- **`setupTestDb()`**: sets up the test database.
- **`queued(template)`**: polls with `eventually` until a mail of that template has been enqueued. Needed because `POST /account/password/reset` responds before the mail is queued, so response time can't reveal whether an address is registered.
- **`mailedToken(template)`**: takes the newest queued mail of a template, extracts `#token=...` from `linkUrl` (third argument), and URL-decodes it. Throws if none is found.
- **`mailedGreeting(template)`**: returns the `greeting` of the newest queued mail of a template, or `''` if there is none.
- **Test groups**:
  - `DELETE /account` and `POST /account/restore`: request returns 202 and sets `deletedBy: 'owner'`. Restore with the mailed `account.deletion-scheduled` token returns 204 and clears `deletedAt`. An unissued token returns 422.
  - `POST /account/password/reset`: known address returns 204 and mails a token. An unknown address gets the same status, body (via `withoutInstance`), `set-cookie` and `etag` as a known one, and nothing is queued. A malformed email returns 422.
  - The name in a mailed greeting: the username appears in a reset mail only for a verified address. For an unverified address, and for signup verification mails, the greeting is `Hello!`.
  - `DELETE /account/sessions`: returns 204 and leaves no session rows for the user.
  - `POST /account/password/check`: a bundled-breach-list password returns 200 with `breached: true`. A non-breached password returns 200. An empty password returns 422.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: partially mocked (`enqueueEmail`) to capture outgoing mail.
- `tests/support/*`:
  - `contract` is imported for its side effects, which presumably register the spec-checking of responses.
  - `setup-test-db` provides `setupTestDb`.
  - `eventually` polls for conditions.
  - `http` provides `api()` and `authenticateAs()`.
  - `problem` provides `withoutInstance`.
- `src/modules/users/tests/factories.ts`: provides `createUser` and `userRepository`, used to seed users and read back state.
- `src/modules/users/repository.ts`: not imported directly. Users are read through `userRepository` re-exported from the users test factories.
- `src/modules/account/tests/factories.ts`: provides `sessionRowsOf`, used to verify sessions are deleted.

## Notes
- The unknown-address test waits `eventually(() => false, 200)` so that "nothing queued" is checked after the detached mail work has had its full window, not racing it. The RateLimit headers are deliberately excluded from the comparison because they count per caller.
- The greeting tests exist because `username` is a free display name. Printing it in a mail to an unproven address would put caller-chosen text in a stranger's inbox, from the shop's own domain.
- The module doc lists an expired-token sweep, but no test for it appears in this file.
