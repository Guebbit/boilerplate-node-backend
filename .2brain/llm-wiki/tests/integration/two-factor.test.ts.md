---
source: tests/integration/two-factor.test.ts
sha256: 9ed5725e785842730fbdfd73536cbfb88519fcaff09bd62857cb2ca95adf4b3c
generated_at: 2026-09-23T20:08:32.005490+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/two-factor.test.ts

## Purpose

End-to-end integration test for the full two-factor authentication lifecycle: enrolling a TOTP device factor, enrolling an email-delivered factor, logging in through the two-step challenge with either method, removing a factor, and disabling the remainder. All requests go through the real Express app so routing, auth guards, and serialization execute as in production. A dedicated bypass test verifies that a challenge token alone can never satisfy a request.

## Key elements

- **`mockOutbox`** – In-memory array that captures every email the (mocked) mailer enqueues; the sole mechanism for reading a delivered code in clear text.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – Replaces `enqueueEmail` with a spy that pushes into `mockOutbox`; must be named `mock*` because `jest.mock` hoists above imports.
- **`codeFor(secret, stepsFromNow?)`** – Generates an RFC 6238 TOTP code at a chosen 30-second offset via `otplib`, avoiding the need to wait for real time steps.
- **`mailedCode()`** – Extracts the 6-digit code from the latest `account.two-factor-code` email in `mockOutbox`.
- **`authenticateVerified()` / `authenticateUnverified()`** – Create a user, POST `/account/login`, and return `{ user, bearer }`; the former ensures a verified email (required for the email factor), the latter explicitly opts out of verification.
- **`enrollTotp(bearer)`** – Runs the full setup → confirm flow for the TOTP factor; returns the secret and backup codes.
- **`enrollEmail(bearer)`** – Runs setup → confirm for the email factor, reading the code from `mockOutbox`.
- **`startLogin(email)`** – POSTs `/account/login` (password step only); the half that returns a challenge rather than a final token.
- **`mintChallenge(userId)`** – Calls `twoFactorService.buildLoginChallenge` directly at the service level to obtain a fresh DB-backed challenge without an HTTP round-trip.
- **`describe('status')`** – Verifies `GET /account/2fa` reports enabled state, armed methods, available methods, backup-code count, and the verified-email gate for email enrollment.
- **`describe('enrolling the device factor')`** – Covers auth requirements, unknown-method 404, setup response shape (secret + `otpauth://` URI, no mail), wrong-code rejection, successful arming with 10 unique backup codes, and that a pending (unconfirmed) factor does not alter login.
- **`describe('enrolling the email factor')`** – Covers the unverified-address 422, masked-address response, mail delivery, and (truncated) arming/backup-code assertions.
- **Bypass test** (at file bottom, per header comment) – Asserts that presenting a challenge token as a bearer does _not_ authenticate a protected request.

## Relationships

| Neighbor                                  | Interaction                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tests/support/http.ts`                   | Supplies `api()` (Supertest wrapper around the real Express app) and `authenticateAs` used by every HTTP call. |
| `tests/support/setup-test-db.ts`          | `setupTestDb()` resets/populates the test database before the suite runs.                                      |
| `tests/support/callers.ts`                | Imports `testCallerContext` for request-context simulation.                                                    |
| `src/modules/users/tests/factories.ts`    | Provides `createUser`, `PLAIN_PASSWORD`, and the `userRepository` instance used by `mintChallenge`.            |
| `src/modules/users/index.ts`              | Exports `TokenType` and `hashToken` (imported for token inspection in assertions).                             |
| `src/modules/users/repository.ts`         | `userRepository.findByIdWithCredentials` is called inside `mintChallenge` to load the user row.                |
| `src/modules/account/services/index.ts`   | Exports `twoFactorService`, whose `buildLoginChallenge` is invoked directly by `mintChallenge`.                |
| `src/modules/account/two-factor/index.ts` | Exports `DELIVERED_CODE_MAX_ATTEMPTS`, used in attempt-limit assertions (truncated section).                   |

## Notes

- The mailer mock must be named with the `mock` prefix; `jest.mock` hoists the factory above all imports, so any non-`mock*` closure variable will be `undefined` at call time.
- `codeFor` defaults to the _current_ TOTP step. After `enrollTotp` has already consumed the "now" step for confirmation, callers pass `stepsFromNow = 1` to land on the next step and avoid the server's replay-protection window (the server's `epochTolerance` is symmetric, so a one-step-ahead code still verifies).
- `mockOutbox` is cleared in `beforeEach`; any test that asserts on mailed content must be the _last_ test in its describe block or must account for prior mails in the same test.
- The file is truncated in the graph snapshot; the full suite also covers factor removal, disabling, and the challenge-token bypass check.
