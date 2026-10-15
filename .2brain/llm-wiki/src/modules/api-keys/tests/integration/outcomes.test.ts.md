---
source: src/modules/api-keys/tests/integration/outcomes.test.ts
sha256: 8be3bf3eb62b50c3a1062eab550b199a17238ca87c3a7f969cc114f7ef99ba55
generated_at: 2026-10-15T10:21:17.657040+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/outcomes.test.ts

## Purpose

Integration test suite that pins the *outcomes* of the API-keys credential service: what it returns (listing order, 404/422 refusals with exact error wording), what it audits (action, target, metadata), and what it mails (template, locale, greeting). It deliberately excludes permission-subset rules (owned by `api-keys.test.ts`) and HTTP-level contracts, instead asserting the same invariants at the service-function boundary.

## Key elements

- **`mockOutbox`** – module-level array that captures every call to the mocked `enqueueEmail`, enabling assertions on mail template, locale, and body content.
- **`jest.mock` (mailer)** – replaces `enqueueEmail` with a no-op that pushes into `mockOutbox`.
- **`jest.mock` (audit port)** – replaces `recordAudit` and `emitAuditEvent` so the test can inspect emitted audit events without a real event bus. `mockEmitAuditEvent` is the exposed jest mock.
- **`createRealUser`** – persists a user via `userRepository.create`, optionally with a `locale` field.
- **`contextFor`** – builds a `TenantCallerContext` for a given user ID, permission list, and tenant.
- **`eventually`** – polls up to 2 s for an async side-effect (mail) that the code under test does not await.
- **`auditedAs`** – filters captured audit events by action string.
- **`mintKey`** – convenience wrapper around `mint` that throws on refusal, used in setup.
- **`describe` blocks** – one-year ceiling, refusal wording, listing / own-keys export, mint audit + mail (including locale and user-lookup-failure paths), revoke 404 / idempotent audit, bulk-revoke audit + mail.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/api-keys/services/api-keys.ts` | The system under test: `findOwnApiKeys`, `latestExpiry`, `list`, `mint`, `revoke`. |
| `src/modules/api-keys/audit.ts` | Provides `apiKeysAuditActions` constants used to filter captured audit events. |
| `src/infrastructure/observability/audit.ts` | Fully mocked; `emitAuditEvent` is the assertion target. |
| `src/infrastructure/adapters/logger.ts` | `logger.warn` spied to confirm a warning is emitted when user lookup fails during mint. |
| `src/modules/users/index.ts` | `userService.getById` spied (reject / resolve `undefined`) to simulate lookup failure. |
| `src/modules/users/tests/factories.ts` | Supplies `userRepository` used by `createRealUser`. |
| `src/kernel/events.ts` | `resetDomainEvents` called in `beforeEach` to isolate domain-event state. |
| `src/kernel/registry.ts` | `registerModules` called in `beforeEach` with `enabledModules`. |
| `src/modules.ts` | `enabledModules` array passed to the registry. |
| `src/modules/account/index.ts` | `ACCOUNT_SESSIONS_REVOKED` imported (used in the truncated bulk-revoke section). |
| `src/types/auth-context.ts` / `src/types/index.ts` | `TenantCallerContext` type for test fixtures. |

## Notes

- `mockOutbox` is a plain array (not a jest mock) so that the hoisted `jest.mock` factory can close over it; it is cleared in `beforeEach`.
- The audit mock **replaces** `recordAudit` rather than spying, because `recordAudit` closes over its own module's `emitAuditEvent`—a simple spy would not intercept the internal call path.
- The `eventually` helper exists because the service fires the mail queue without awaiting it; a plain `await mint(...)` is insufficient to observe the side-effect.
- `afterEach` calls `jest.restoreAllMocks()` (for `spyOn`-based stubs of `userService` and `logger`), while `jest.mock`-based replacements persist for the whole file.
- The file's own doc-comment explicitly scopes it: it does **not** cover permission-subset validation logic or HTTP status/shape contracts.
