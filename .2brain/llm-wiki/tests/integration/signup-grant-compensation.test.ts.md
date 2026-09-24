---
source: tests/integration/signup-grant-compensation.test.ts
sha256: fba6acc995806e94f48a90764b2f66df6815554ed672bae2b3203029b88d7d89
generated_at: 2026-09-23T20:07:34.161207+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/signup-grant-compensation.test.ts

## Purpose

Integration test verifying that when the starting role/membership grant fails after a `User` row has already been written, the account module compensates by deleting that row — so the email or OAuth identity can retry signup. Covers both the self-service signup path and the OAuth login-or-create path. Lives in `tests/integration/` (not in either module's own `tests/`) because the failure is forced in the access module while the compensating delete is in the account module.

## Key elements

- **`failMembershipWritesWith(failure: Error)`** — local helper; spies on `membershipModel.findOneAndUpdate` and returns a stub whose `exec` rejects with the given error. Same mocking shape used in `access.test.ts`.
- **`describe('self-service signup')`** — asserts `accountService.signup` returns a `ResponseReject` with `success: false` and that `userRepository.findOne({ email })` is `null` after the failed grant.
- **`describe('OAuth signup')`** — asserts `accountService.loginOrCreateFromOAuth` rejects with the injected error and that the OAuth user's row is likewise deleted.

## Relationships

- **`src/modules/account/index.ts`** — source of `accountService`, the system under test (both `signup` and `loginOrCreateFromOAuth`).
- **`src/modules/access/model.ts`** — source of `membershipModel`; its `findOneAndUpdate` method is spied on to simulate the grant failure.
- **`src/modules/users/tests/factories.ts`** — provides `userRepository` (used to assert row deletion) and the `PLAIN_PASSWORD` constant.
- **`src/modules/users/repository.ts`** — the actual repository that `userRepository` wraps; the final assertions query it.
- **`src/infrastructure/http/response.ts`** — provides the `ResponseReject` type used to cast the signup result.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory MongoDB for the test.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the auth/request context passed to both service calls.
- **`tests/support/stub.ts`** — `asStub` casts a partial object to the full return type so `mockReturnValue` type-checks.

## Notes

- The file's top-level doc comment explains the *why*: the `User` write must precede the role grant (the grant needs a real `_id`), so a grant failure can leave an orphan row. Without compensation the unique email/identity index would block all future retries.
- `afterEach(() => jest.restoreAllMocks())` is the sole cleanup; no explicit `jest.restoreAllMocks` call appears in individual tests.
- The OAuth test expects a thrown rejection (`.rejects.toThrow('mongo is down')`) rather than a structured `ResponseReject`, reflecting that `loginOrCreateFromOAuth` propagates the error rather than wrapping it.
