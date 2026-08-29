# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface — profile update, authenticated password change, session/token revocation, and email verification — exercised at the service and repository layer against a real test database. Tests are grouped by the security invariant each defends (e.g. no privilege escalation, no cross-token-kind revocation, 422-vs-401 semantics) rather than by individual function.

## Key elements

- **`updateProfile`** — verifies users can change their own fields; rejects invalid email (422), missing account (404), taken email (409); blocks injection of `admin`, `active`, `password`; unsets `verified` when email changes but preserves it when restated unchanged.
- **`passwordChangeWithCurrent`** — confirms new/old credential swap, returns 422 (not 401) for wrong current password, validates confirm-password match before any bcrypt work.
- **`sessionRemove`** (repository-level) — revokes exactly one named REFRESH token; cannot reach other token types (e.g. `password` reset tokens) through the session handle; cannot target another user's tokens.
- **`sessionRevoke`** (service-level) — emits an audit event only when a token actually matched; does **not** audit a no-op (invented id).
- **`tokenRemoveByValue`** — removes one session by its token value, leaves siblings intact; reports `modifiedCount: 0` for an unspent value.
- **`logoutCurrentSession`** — revokes the named refresh token and records the logout via audit (test partially visible).
- **`readTokens`** (local helper) — re-fetches a user's stored tokens after a mutation to assert state.
- **Mocked ports** — `auditPort.emitAuditEvent` and `analyticsPort.emitAnalyticsEvent` are replaced via `jest.mock` so assertions can use `observePort` from `tests/support/ports`.

## Relationships

- Imports service functions (`updateProfile`, `passwordChangeWithCurrent`, `accountService`) from **`src/modules/account/services/index.ts`** (backed by `profile.ts` and `verification.ts`).
- Imports `userRepository` and `TokenType` from **`src/modules/users/index.ts`**; calls repository methods (`sessionRemove`, `tokenRemoveByValue`, `findByIdWithCredentials`, `deleteOne`) defined in **`src/modules/users/repository.ts`**; uses the user model's `tokenAdd` from **`src/modules/users/model.ts`**.
- Uses `createUser` / `PLAIN_PASSWORD` from **`src/modules/users/tests/factory.ts`** to seed fixtures.
- Imports `accountAuditActions` from **`src/modules/account/audit.ts`** and `accountAnalyticsEvents` from **`src/modules/account/analytics.ts`** to assert the correct constants appear in emitted events.
- Mocks **`src/infrastructure/observability/audit.ts`** and **`src/infrastructure/observability/analytics/index.ts`**; observes them via `observePort` from **`tests/support/ports.ts`**.
- Uses `asSuccess` / `asReject` from **`tests/support/response.ts`** to unwrap service responses, `testCallerContext` from **`tests/support/caller-context.ts`**, and `setupTestDb` from **`tests/support/setup-test-db.ts`**.

## Notes

- **Mock strategy:** The audit and analytics ports are replaced with `jest.mock` (not `jest.spyOn`) because CommonJS namespace imports expose non-configurable getters that `spyOn` cannot redefine under the project's swc transform or inside Stryker's sandbox. See `tests/support/ports.ts` for the full rationale.
- **Invariant grouping:** The file header explicitly states that tests are organized by the property they defend (e.g. "a wrong current password must be 422, never 401"), mirroring the convention in `service.test.ts`.
- **422 vs 401:** A dedicated test locks in that a wrong current password returns 422 — a 401 would erroneously log the user out of a valid session.
- **Token-kind isolation:** `sessionRemove` must only affect REFRESH tokens; passing a `password`-type token id yields `modifiedCount: 0`.
- **Audit fidelity:** `sessionRevoke` must *not* emit an audit event when no token matched, preventing a fabricated id from appearing in logs as a successful revocation.
