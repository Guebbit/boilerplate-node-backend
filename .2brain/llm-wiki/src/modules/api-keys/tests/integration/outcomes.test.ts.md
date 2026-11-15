---
source: src/modules/api-keys/tests/integration/outcomes.test.ts
sha256: 076a8cc60333f08115b0a6590fa23afe5df47a5dd1ee42a08325e411ad39707a
generated_at: 2026-11-14T19:22:25.484769+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/outcomes.test.ts

## Purpose

Integration test suite that pins the user-visible *outcomes* of the API-key service: the one-year expiry ceiling, the exact wording of validation refusals, listing semantics (ordering, tenant isolation, status labels, export), audit rows, and queued mails. It operates at the service layer (not HTTP), and explicitly defers permission-subset rule assertions to `api-keys.contract.test.ts`.

## Key elements

- **`mockOutbox`** – Module-level array that captures every `enqueueEmail` call (to, subject, template, data). Named with `mock*` so the hoisted `jest.mock` can close over it.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a recorder that pushes into `mockOutbox`; keeps all other mailer exports intact via `requireActual`.
- **`jest.mock('@infrastructure/observability/audit')`** – Full module replacement (not a spy) with `auditPortMock()` from `@tests/ports`, because `recordAudit` closes over its own module's `emitAuditEvent`.
- **`createRealUser(id, locale?)`** – Persists a user via `userRepository.create` so tests exercise real DB reads.
- **`contextFor(userId, permissions?, tenantId?)`** – Builds a `TenantCallerContext` for the given user and permission set.
- **`eventually(done)`** – Polls up to 2 s (40 × 50 ms) for a fired-and-forgotten side effect (e.g. a queued mail) to appear.
- **`auditedAs(action)`** – Filters `mockEmitAuditEvent` calls to a specific `apiKeysAuditActions` value.
- **`mintKey(context, name?)`** – Mints a key with `IN_A_WEEK` expiry and returns the wire-shape `data`, failing loudly if the mint is refused.
- **`expireAt(id, expiresAt)`** – Directly mutates a stored key's `expiresAt` through `apiKeyRepository` (needed because `mint` rejects past dates).
- **`describe('the one-year ceiling')`** – Verifies `latestExpiry` is a calendar year (handles leap days), and that `mint` accepts the exact ceiling but rejects a millisecond past it with a 422 `VALIDATION_ERROR`.
- **`describe('what a refusal says')`** – Asserts the exact `message` and `details.permissions` on a permission-subset refusal.
- **`describe('listing')`** – Covers newest-first ordering, tenant isolation, status labels (`active`/`revoked`/`expired`/`suspended`), precedence of `revoked` over `suspended`, custom sort fields, `maxExpiresAt` in the response, and `findOwnApiKeys` scoping.
- **`describe('minting leaves an audit row and a mail')`** – (truncated in source) Asserts audit event shape and queued-mail content/locale.

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** – Primary system under test: `mint`, `revoke`, `list`, `findOwnApiKeys`, `latestExpiry`.
- **`src/modules/api-keys/audit.ts`** – Exports `apiKeysAuditActions` used as the discriminator in `auditedAs` assertions.
- **`src/modules/api-keys/repository.ts`** – `apiKeyRepository` used by the `expireAt` setup helper to mutate stored keys.
- **`src/infrastructure/observability/audit.ts`** – Mocked; its `emitAuditEvent` is the call whose arguments are asserted.
- **`src/kernel/registry.ts`** – `registerModules(enabledModules)` called in `beforeEach` to wire the module graph.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `beforeEach`; `emitDomainEvent` available for domain-event assertions.
- **`src/modules.ts`** – `enabledModules` array passed to `registerModules`.
- **`src/modules/users/tests/factories.ts`** – Provides `userRepository` used by `createRealUser` and the `updateMany` calls that toggle `active`/suspended state.
- **`src/types/auth-context.ts`** – `TenantCallerContext` type consumed by `contextFor` and all service calls.
- **`src/modules/account/index.ts`** – `ACCOUNT_SESSIONS_REVOKED` imported (likely for session-revocation side-effect assertions in the truncated portion).

## Notes

- The module docstring draws a hard boundary with `api-keys.contract.test.ts`: that file owns permission-subset *rules*; this file pins the *outcomes* (wording, audit rows, mails) at the service door. Do not add permission-logic assertions here.
- The mailer mock is a **replacement**, not a spy: `enqueueEmail` is a new function, so `jest.restoreAllMocks` in `afterEach` will not reset it. `mockOutbox` is cleared manually in `beforeEach`.
- The audit mock is likewise a full module swap (via `auditPortMock()`), not a `jest.spyOn`; `mockEmitAuditEvent.mockClear()` in `beforeEach` is the only reset.
- `eventually` exists because the code under test fires mails without `await`; direct `expect` after the call will race.
- `expireAt` bypasses the service layer intentionally—`mint` will not accept a past date, so the only way to create an "expired" key for listing tests is a direct repository write.
