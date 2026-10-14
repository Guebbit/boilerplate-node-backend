---
source: src/modules/api-keys/tests/integration/outcomes.test.ts
sha256: 61440099c1fae10614bf3aa8f1164fdaa9c4f250e973f861e625a1cb8f56aa1d
generated_at: 2026-10-14T15:03:38.361712+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/outcomes.test.ts

## Purpose

Integration test that pins the observable outcomes of the API-keys service layer: the one-year expiry ceiling and its enforcement, the exact wording of validation refusals, tenant/user isolation in listing and lookup, audit-row shape on mint and revoke, and the mail content (locale, key name, greeting/advice/footer). It operates at the service door (not the HTTP contract suite) and is complementary to `api-keys.test.ts`, which owns permission-subset rules.

## Key elements

- **`mockOutbox`** — module-level array that every intercepted `enqueueEmail` call pushes into; asserted against to verify mail template, locale, and body content.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a recorder so mails are captured without sending.
- **`jest.mock('@infrastructure/observability/audit')`** — replaces `recordAudit` so it delegates to a mock `emitAuditEvent`, letting tests filter recorded events by action.
- **`eventually`** — polls up to 2 s for an async side-effect (mail, log) that the code under test does not `await`.
- **`auditedAs(action)`** — filters `mockEmitAuditEvent` calls to a single audit action for targeted assertions.
- **`mintKey`** — wraps `mint` with a default name/permissions/expiry; throws if setup is refused.
- **Test suites** — `the one-year ceiling`, `what a refusal says`, `listing`, `minting leaves an audit row and a mail`, `revoking`, `revoking everything a person minted`.

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** — the system under test; imports `findOwnApiKeys`, `latestExpiry`, `list`, `mint`, `revoke`.
- **`src/modules/api-keys/audit.ts`** — imports `apiKeysAuditActions` to reference concrete audit-action identifiers in assertions.
- **`src/infrastructure/observability/audit.ts`** — mocked; the mock replaces `recordAudit`/`emitAuditEvent` so tests can inspect emitted audit events without side effects.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is spied on to assert a warning is emitted when the minter lookup fails during mint.
- **`src/kernel/events.ts`** — `resetDomainEvents` is called in `beforeEach` to clear the event bus between tests.
- **`src/kernel/registry.ts`** — `registerModules` is called in `beforeEach` to re-initialize the module registry for a clean state.
- **`src/modules.ts`** — `enabledModules` is passed to `registerModules` to mirror production module wiring.
- **`src/modules/account/index.ts`** — `ACCOUNT_SESSIONS_REVOKED` is imported (used in the bulk-revoke session-revocation assertion in the truncated tail).
- **`src/modules/users/index.ts`** — `userService.getById` is spied on to simulate lookup failure and user-absent scenarios.
- **`src/modules/users/tests/factories.ts`** — `userRepository.create` is used to persist real test users in the test DB.
- **`src/types/index.ts`** — provides the `TenantCallerContext` type used by the `contextFor` helper.

## Notes

- The audit mock **replaces** `recordAudit` rather than spying on it, because `recordAudit` closes over its own module's `emitAuditEvent`; a plain spy would not intercept the internal call path.
- `mockOutbox` is declared as a plain mutable array (not a `jest.fn`) so the hoisted `jest.mock` factory can reference it without triggering a "Cannot access before initialization" TDZ error.
- Mail assertions use the `eventually` poller because the service fires the mail without `await`-ing it; a plain `setTimeout` is insufficient for CI timing.
- The one-year ceiling test uses a fixed calendar date (`2030-02-28`) to verify the "same day a year on" rule independent of the current clock.
- Revoking the same key twice is expected to produce **exactly one** audit row (idempotent audit), which is a deliberate contract assertion.
