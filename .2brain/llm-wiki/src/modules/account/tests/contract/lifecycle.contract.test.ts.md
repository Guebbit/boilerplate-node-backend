---
source: src/modules/account/tests/contract/lifecycle.contract.test.ts
sha256: b08824d03c8d17ce1479c7f5dce0f38f73c0338f949d1500938eb5a1c877db0f
generated_at: 2026-09-27T14:33:19.838823+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/lifecycle.contract.test.ts

## Purpose

Contract tests for account-lifecycle endpoints that the broader `api.contract.test.ts` does not cover: two-step account deletion, password-reset request, logout-all, the in-flight breach check, and the expired-token sweep. Each success path is driven end-to-end — the one-time token is read back out of the mocked mail queue rather than injected — so the request body asserted against the OpenAPI spec is the one a real client would send.

## Key elements

- **`mailedToken(template: string): string`** — Helper that inspects `mailerPort.enqueueEmail` mock call history, finds the most recent mail whose template name matches, extracts the `token` query param from its `linkUrl`, and returns it URI-decoded. Throws if no matching mail was queued.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — Replaces `enqueueEmail` with a `jest.fn()` resolving to `undefined`, while preserving the rest of the real module via `requireActual`. This lets tests assert *no* mail was sent (password-reset unknown-email case) while still reading tokens back from the call log.
- **`describe('DELETE /account and DELETE /account/delete-confirm')`** — Verifies the two-step deletion contract (request → confirm with mailed token) and the 422/401 error contracts. Asserts the user row is gone via `userRepository.findById`.
- **`describe('POST /account/reset')`** — Verifies the reset-request contract, confirms a token was mailed for a known address, and asserts an unknown address returns the same 200 shape *without* calling `enqueueEmail` (anti-enumeration).
- **`describe('POST /account/logout-all')`** — Verifies the contract and asserts all `refresh`-type tokens are removed from the stored credential record.
- **`describe('POST /account/password/check')`** — Verifies the contract for a breached candidate, a non-breached candidate, and the 422 empty-string case.
- **`describe('DELETE /account/tokens/expired')`** — Verifies the 200 contract for an admin and the 403 contract for a customer.

## Relationships

- **`tests/support/contract.ts`** — Provides the `toSatisfyApiSpec()` matcher used on every response assertion to validate the body against the API spec.
- **`tests/support/http.ts`** — Supplies `api()` (supertest wrapper) and `authenticateAs(role)` (creates a session, returns bearer token).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to seed/isolate the test database before any suite runs.
- **`src/modules/users/tests/factories.ts`** — Exports `createUser` (to seed a known address for the reset test) and `userRepository` (to assert post-conditions: row deleted, tokens cleared).
- **`src/infrastructure/adapters/mailer.ts`** — Mocked at the module level; its `enqueueEmail` is the sole mail-queue seam. Tests read token values from its call history and use it to verify the no-mail invariant.

## Notes

- The mailer mock does **not** replace the whole module — it spreads `requireActual` and overrides only `enqueueEmail`. This means any other export (e.g. template renderers) remains real, so token generation in the link still works.
- `mailedToken` uses `Array.prototype.findLast` (ES2023). If the project's TS/Node target is older, this is a potential compatibility concern.
- The password-reset "unknown address" test asserts `enqueueEmail` was *not* called at all, which couples the test to the implementation choice of suppressing the mail rather than sending a dummy.
- `beforeEach` clears the mailer mock, so each test starts with an empty queue; `mailedToken` therefore always targets the first (and only) mail of the relevant template in that test.
