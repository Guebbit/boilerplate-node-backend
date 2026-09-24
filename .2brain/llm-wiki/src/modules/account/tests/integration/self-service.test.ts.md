---
source: src/modules/account/tests/integration/self-service.test.ts
sha256: 5321bbf88055c357883d77a7bc59a01e0e2f9fcfe802d0f571ffbc396d8653c5
generated_at: 2026-09-23T18:14:12.926952+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface (profile update, password change, email verification, session revocation) exercised at the service/repository layer. Tests are grouped by the invariant each one defends: a profile update cannot alter role/state/password; a wrong current password yields 422 (never 401, which would kill a valid session); and at most one verification link is active, always the newest.

## Key elements

- **`updateProfile` describe block** — covers field-update semantics, 401-for-deleted-account, privilege-escalation rejection (strict `zodProfileSchema`), pending-email lifecycle (set, cancel, restate-unchanged), and 409 collision on both direct and pending addresses.
- **`completeEmailChange` describe block** — verifies the full swap: `pendingEmail → email`, `verifiedAt` set, refresh tokens revoked, and the `AUTH_EMAIL_CHANGE_COMPLETED` audit event emitted.
- **Token-type isolation describe block** — asserts `EMAIL_VERIFY_TOKEN_TYPE` and `EMAIL_CHANGE_TOKEN_TYPE` are disjoint (a token of one type is invisible under the other) and that `sendVerificationEmail` with the change type is a no-op without a `pendingEmail`.
- **`passwordChangeWithCurrent` describe block** — verifies correct-current-password flow (file is truncated here, but the invariant is a wrong current password → 422).
- **`readTokens` helper** — re-fetches a user with credentials to inspect stored tokens after a service call.
- **`jest.mock` for audit / analytics / access** — full module replacements (not spies) that override `emitAuditEvent`, `recordAudit`, `emitAnalyticsEvent`, and `rolesOf` while calling through to real implementations by default.

## Relationships

- **`@modules/users/tests/factories`** — source of `createUser`, password constants, and `userRepository`; all tests create fixtures through it.
- **`@modules/account/services`** — the unit under test: `updateProfile`, `passwordChangeWithCurrent`, `sendVerificationEmail`, `completeEmailChange`, `accountService`, token-type constants, and `VERIFY_RESEND_SECONDS`.
- **`@infrastructure/observability/audit`** / **`@infrastructure/observability/analytics`** — mocked out so tests can assert (or suppress) audit/analytics side-effects without touching the real emit pipeline.
- **`@modules/access`** (`rolesOf`) — mocked with a call-through `jest.fn` so membership lookups work normally except in the one B23 case that overrides it with `mockRejectedValueOnce`.
- **`@kernel/access/tenant`** (`DEPLOYMENT_TENANT_ID`) — the tenant identifier passed to `rolesOf` in the escalation test.
- **`../../audit`** / **`../../analytics`** — `accountAuditActions` and `accountAnalyticsEvents` used to assert the exact audit/analytics payloads emitted.
- **`@infrastructure/adapters/logger`** — imported (likely for log-output suppression or assertion in the truncated portion).
- **`@modules/users`** — `TokenType` and `hashToken` for token-type assertions and token creation.

## Notes

- **Mock strategy is deliberate replacement, not spying.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; it fails under the SWC transform (`jest.config.mutation.js`) and inside Stryker's sandbox. Hence the `jest.mock` factory pattern seen for audit, analytics, and access.
- **`recordAudit` gets its own override** inside the audit mock because it closes over the real module's `emitAuditEvent` internally; without the redirect, a spy on `emitAuditEvent` would miss every `recordAudit`-originated event.
- **`rolesOf` is a call-through mock** (`jest.fn(actual.rolesOf)`), so only the single B23 test that does `mockRejectedValueOnce` sees different behavior; all other tests exercise the real membership lookup.
- **Deleted account → 401, not 404.** The OpenAPI contract declares no 404 on `PUT /account`, and the `isAuth` guard treats a missing user as unauthenticated.
- **Profile body is strict.** Including any field outside the schema (`role`, `active`, `password`) causes the entire request to be rejected (422) rather than partially applied.
