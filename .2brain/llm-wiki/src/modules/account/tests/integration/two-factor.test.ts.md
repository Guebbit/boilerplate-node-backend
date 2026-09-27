---
source: src/modules/account/tests/integration/two-factor.test.ts
sha256: 9fd95946f33451f3f0040421717c4d3a2249d70e1b15066323919409cc5573cd
generated_at: 2026-09-27T14:36:11.783864+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/two-factor.test.ts

## Purpose

End-to-end integration tests for the two-factor authentication lifecycle — TOTP enrollment, delivered-code enrollment, the two-step login challenge, factor removal, and full 2FA disablement. Drives the real Express app (routing, auth guards, serialization) rather than unit-testing services in isolation, so regressions in any of those layers are caught. The file's own comments flag the bypass check (a challenge token authenticating a request on its own) as the single most important assertion in the suite.

## Key elements

- **`mockOutbox`** — Array that the mocked mailer pushes into; the sole mechanism for reading a delivered 6-digit code in tests. Named `mock*` because `jest.mock` hoisting requires that prefix on any identifier it closes over.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — Replaces `enqueueEmail` with a recorder; all other exports are passed through via `requireActual`.
- **`mailedCode()`** — Reads the most recent `account.two-factor-code` entry from `mockOutbox` and returns its `data.code`.
- **`authenticateVerified()`** — Creates a user with `verifiedAt` set, logs in via `POST /account/login`, returns `{ user, bearer }`.
- **`authenticateUnverified()`** — Same but omits `verifiedAt`; used for the two tests that exercise the unverified-address rejection path.
- **`enrollTotp(bearer)`** — Full TOTP setup + confirm cycle using `codeFor(secret, 0)`; returns the secret and backup codes.
- **`enrollEmail(bearer)`** — Full email setup + confirm cycle reading the code from `mockOutbox`.
- **`startLogin(email)`** — Password-only login step; asserts the response contains a challenge (not a token) when 2FA is armed.
- **`mintChallenge(userId)`** — Calls `twoFactorService.buildLoginChallenge` directly at the service level for suites that need a fresh challenge without a full login round-trip.
- **`describe('status')`** — Verifies `GET /account/2fa`: auth required, fresh-account shape, unverified-email gating, and post-enrollment state transitions.
- **`describe('enrolling the device factor')`** — TOTP setup/confirm happy path, wrong-code 422, unknown-method 404, pending-factor-does-not-change-login.
- **`describe('enrolling the email factor')`** — Unverified rejection, masked-address response, code-from-outbox confirm, never-mailed-code rejection.
- *(Truncated sections cover: login challenge flow, factor removal, disabling, and the bypass check.)*

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Imports `twoFactorService`; used by `mintChallenge` to build a login challenge directly. |
| `src/modules/account/two-factor/index.ts` | Imports `DELIVERED_CODE_MAX_ATTEMPTS` (likely referenced in the attempt-limit test in the truncated portion). |
| `src/modules/users/index.ts` | Imports `TokenType`, `hashToken` (used in the bypass / token-inspection test). |
| `src/modules/users/repository.ts` | `userRepository.findByIdWithCredentials` is called inside `mintChallenge` to load the user + credentials. |
| `src/modules/users/tests/factories.ts` | `createUser`, `PLAIN_PASSWORD`, and `userRepository` — the primary test-fixture entry points. |
| `tests/support/http.ts` | `api()` provides the supertest-based HTTP client; `authenticateAs` is imported but this suite defines its own verified/unverified helpers to state the email-verification requirement explicitly. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initializes the test database before any test runs. |
| `tests/support/totp.ts` | `codeFor(secret, offset)` generates a valid TOTP code for confirmation steps. |
| `tests/support/callers.ts` | `testCallerContext` imported (likely used in the bypass or role-guard test in the truncated section). |

## Notes

- **`mockOutbox` naming is not optional.** `jest.mock` factories are hoisted above imports; they may only reference identifiers prefixed with `mock` or `jest`. Renaming breaks the mock silently.
- **`authenticateAs` defaults to a verified account.** This suite deliberately avoids it for the unverified cases and defines its own helpers so the requirement is visible at the call site rather than buried in a shared default.
- **No real mail is sent.** The mailer adapter is fully mocked; `mockOutbox` is the only source of truth for delivered codes.
- **The file imports `decode` from `jsonwebtoken`** — used to inspect a challenge token's claims in the bypass test (truncated section) without verifying the signature.
- **`DELIVERED_CODE_MAX_ATTEMPTS`** is imported from the two-factor module but its usage is in the truncated portion; it likely bounds how many wrong-code attempts are allowed before the challenge is invalidated.
