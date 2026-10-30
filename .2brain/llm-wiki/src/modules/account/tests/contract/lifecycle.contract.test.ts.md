---
source: src/modules/account/tests/contract/lifecycle.contract.test.ts
sha256: ad66ec59a85df5a24eea027a6473266c9b14fea770fb59da4bb38208b3efcc4f
generated_at: 2026-10-29T02:51:21.725383+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/lifecycle.contract.test.ts

## Purpose

Contract tests for account-lifecycle endpoints that `api.contract.test.ts` does not cover: scheduled deletion + restore, password-reset request (including the anti-enumeration guarantee), "log out everywhere," the in-field breach check, and the mailed-greeting safety check. Each flow is driven end-to-end: the one-time token or greeting text is read back from the mocked mailer queue, so the assertion targets the exact artifact a real recipient would receive.

## Key elements

- **`queued(template)`** — polls `enqueueEmail` mock calls until a mail of the given template appears; used because `POST /account/password/reset` intentionally returns before the mail is enqueued.
- **`mailedToken(template)`** — extracts the `#token=` fragment from the newest queued mail's `linkUrl`; throws if absent.
- **`mailedGreeting(template)`** — returns the `greeting` field of the newest queued mail of a template.
- **`describe('DELETE /account and POST /account/restore')`** — verifies 202 on delete, `deletedBy === 'owner'` in the DB, then 204 on restore with the mailed token clearing `deletedAt`.
- **`describe('POST /account/password/reset')`** — verifies 204 + token for known addresses; asserts byte-identical status/body/cookies/ETag for unknown addresses (anti-enumeration); 422 for a non-email body.
- **`describe('the name in a mailed greeting')`** — asserts the caller-chosen `username` appears in a reset mail only when the address is verified; unverified addresses and signup verification mails get a generic `"Hello!"`.
- **`describe('DELETE /account/sessions')`** — 204 and all session rows for the user are gone.
- **`describe('POST /account/password/check')`** — 200 for a breached candidate, 200 for a clean candidate, 422 for an empty string.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called at module level for DB isolation.
- **`tests/support/http.ts`** — `api()` builds superagent requests; `authenticateAs('user')` returns `{ user, bearer }`.
- **`tests/support/eventually.ts`** — `eventually(fn, timeout?)` provides the polling loop behind `queued()` and the deliberate 200 ms "nothing queued" window.
- **`tests/support/problem.ts`** — `withoutInstance(body)` strips the non-deterministic `instance` field before deep-equality comparison of problem+error bodies.
- **`tests/support/contract.ts`** — imported for its side effects (global contract-test setup/assertions).
- **`src/modules/users/tests/factories.ts`** — `createUser` builds fixture users; `userRepository.findById` reads back locked/restored state.
- **`src/modules/account/tests/factories.ts`** — `sessionRowsOf(userId)` returns the user's session rows for the "log out everywhere" assertion.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is jest-mocked at the module level; tests read tokens/greetings from its call log rather than from a separate in-memory queue.

## Notes

- The mailer mock replaces `enqueueEmail` with a `jest.fn()` that resolves `undefined`; all other exports are preserved via `requireActual`. `beforeEach` clears the mock so each test starts with an empty queue.
- `findLast` (not `find`) is used to retrieve the *newest* mail of a template — critical when a test sequence queues multiple mails of the same type (e.g., the known-vs-unknown reset test).
- The "no account enumeration" test waits a full 200 ms (`eventually(() => false, 200)`) before asserting no mail was queued, distinguishing a deliberate "not queued" result from a timing race.
- The file's doc comment mentions "the expired-token sweep," but no corresponding `describe` block is present in the file as shown — that scenario may live elsewhere or be pending.
- The greeting-safety tests encode a security invariant: a caller-supplied `username` must never be rendered into mail addressed to an unproven or third-party email, preventing a reflected-text phishing vector via the shop's own domain.
