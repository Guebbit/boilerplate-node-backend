---
source: src/modules/account/tests/contract/code-delivery.contract.test.ts
sha256: 595668b021d0e18ea7a5c3840e960f945840ed4f35a9cdd20e92cbaea620026c
generated_at: 2026-11-08T04:31:16.817142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/code-delivery.contract.test.ts

## Purpose

Contract test for email-code delivery against two deployment conditions other suites mask: a `log` mail transport where code mail reaches no human, and the shared hourly send budget that both 2FA and step-up (reauth) endpoints draw from. It locks the API's observable behavior (status codes, response shapes, budget enforcement) so a deployment that silently drops mail or changes budget accounting is caught here.

## Key elements

- **`mockOutbox`** — module-level array; every call to the mocked `enqueueEmail` pushes `{ template, data }` here. Read back to extract the confirmation `code`.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a jest.fn that records into `mockOutbox` and resolves immediately. All other exports of the mailer module are spread from the real module.
- **`describe('a deployment whose mail reaches no person')`** — sets `NODE_MAIL_TRANSPORT: 'log'`. Two tests:
  - `POST /account/2fa/methods/email/setup` returns **404** with the same body (minus `instance`) as a nonsense method path.
  - `GET /account/reauth` for a password-less (OAuth-only) user returns `{ methods: [] }`, and `POST …/methods/email/send` returns **422**.
- **`describe('the send budget shared by 2FA and step-up')`** — sets `NODE_MAIL_TRANSPORT: 'outbox'` and `NODE_MFA_ACCOUNT_SEND_MAX: '2'`. Arms the email factor (setup + confirm), then fires two `/send` calls (one 2FA, one reauth) → both **200**; a third → **429**.
- **`mintSession`** (from `../factories`) — mints a bearer token with a chosen `amr` array, used to simulate OAuth-only or post-OTP sessions.

## Relationships

- **`tests/support/contract.ts`** — imported for side-effect: installs contract-test globals/presets.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` bootstraps and tears down the test database.
- **`tests/support/environment.ts`** — `setEnvironment` / `withEnvironmentOverrides` swap `NODE_MAIL_TRANSPORT` and `NODE_MFA_ACCOUNT_SEND_MAX` per block.
- **`tests/support/http.ts`** — `api()` (supertest-style request builder) and `loginBearer` (authenticates a known user and returns the token).
- **`tests/support/problem.ts`** — `withoutInstance` strips the non-deterministic `instance` field so 404 bodies can be deep-equal-compared.
- **`src/modules/users/tests/factories.ts`** — `createUser` (one-shot verified user) and `userRepository.create` (raw user without `createUser` defaults).
- **`src/modules/account/tests/factories.ts`** — `mintSession` builds a session token for an arbitrary user + `amr` set.
- **`src/modules/users/repository.ts`** — consumed transitively through the users test factory; not imported directly here.

## Notes

- The suite intentionally does **not** use the shared `outbox` default; the `log`-transport block is the whole reason this file exists alongside the other account contract tests.
- Arming the email factor (`/setup` + `/confirm`) does **not** consume a slot from `NODE_MFA_ACCOUNT_SEND_MAX`; only the two `/send` routes do. The test asserts this by arming first, then spending the full budget of 2 on sends.
- `mockOutbox` is cleared in the top-level `beforeEach`, but only the budget block ever reads from it (to extract the `code`). The `log`-transport block relies on the API *not* enqueuing, so the mock is inert there.
- The 404-indistinguishability assertion compares `email` response to a `nonsense` method path, normalising both with `withoutInstance` to avoid the `instance` URI mismatch.
