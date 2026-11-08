---
source: src/modules/api-keys/tests/integration/outcomes.test.ts
sha256: d5d58c1a8f35885e0b6279dbd762eb16fa15d0ef91f82bf562909c843d671bb2
generated_at: 2026-11-08T05:06:04.455597+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/outcomes.test.ts

## Purpose

Integration test suite that pins the observable outcomes of the API-key service at its public door: the one-year expiry ceiling, refusal wording, listing semantics (ordering, tenant isolation, status vocabulary), audit rows, and outgoing mail. It explicitly defers permission-subset rules to `api-keys.contract.test.ts` and does not cover HTTP-level contracts.

## Key elements

- **`mockOutbox`** — module-level array that captures every queued email; referenced by the hoisted `jest.mock` for the mailer so `enqueueEmail` appends here instead of sending.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a recording stub; other mailer exports are preserved via `jest.requireActual`.
- **`jest.mock('@infrastructure/observability/audit')`** — swaps the audit port for `auditPortMock()` (from `@tests/ports`) so `emitAuditEvent` becomes a jest mock; necessary because `recordAudit` closes over its own module binding rather than a spy target.
- **`createRealUser(id, locale?)`** — inserts a real user row via `userRepository.create` and returns it.
- **`contextFor(userId, permissions, tenantId)`** — builds a `TenantCallerContext` scoped to a tenant, with `unrestricted: false`.
- **`eventually(done)`** — polls up to 40 × 50 ms (≈2 s) for a condition that the code under test fulfills without awaiting (e.g., fire-and-forget mail).
- **`auditedAs(action)`** — filters `mockEmitAuditEvent.mock.calls` to events matching a given audit action string.
- **`mintKey(context, name)`** — mints a key with a one-week expiry and a single read permission; throws if the mint is refused (setup guard).
- **`expireAt(id, date)`** — directly mutates a stored key's `expiresAt` via `apiKeyRepository`, bypassing the service's mint validation.
- **`IN_A_WEEK`** — ISO timestamp 7 days out, safely inside the ceiling.
- **Test suites**: "the one-year ceiling", "what a refusal says", "listing", "minting leaves an audit row and a mail".
- **`beforeEach`** — clears outbox, clears audit mock, resets domain events, re-registers `enabledModules`.
- **`afterEach`** — restores real timers and all mocks.

## Relationships

- **`src/modules/api-keys/services/api-keys.ts`** — the unit under test; imports `findOwnApiKeys`, `latestExpiry`, `list`, `mint`, `revoke`.
- **`src/modules/api-keys/audit.ts`** — imports `apiKeysAuditActions` to name actions in assertions.
- **`src/modules/api-keys/repository.ts`** — imports `apiKeyRepository` for the `expireAt` setup helper.
- **`src/infrastructure/observability/audit.ts`** — mocked wholesale; `emitAuditEvent` is the assertion target.
- **`src/kernel/events.ts`** — `resetDomainEvents` and `emitDomainEvent` used in setup.
- **`src/kernel/registry.ts`** — `registerModules` re-registers the module graph each test.
- **`src/modules.ts`** — provides `enabledModules` for registration.
- **`src/modules/users/tests/factories.ts`** — supplies `userRepository` for creating real user fixtures.
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** — `userService` imported (used for suspension / account-state assertions).
- **`src/modules/account/index.ts`** — `ACCOUNT_SESSIONS_REVOKED` event constant for event-related assertions.
- **`src/types/auth-context.ts`** — `TenantCallerContext` type for all call contexts.
- **`src/infrastructure/adapters/logger.ts`** — imported (likely for log-assertion support in mail/audit flows).

## Notes

- The mailer mock uses a **closed-over array** (`mockOutbox`) rather than a spy, specifically so the hoisted `jest.mock` factory can reference it. Do not convert to `jest.spyOn` without also hoisting the array.
- The audit port is **replaced, not spied on**, because `recordAudit` captures `emitAuditEvent` from its own module scope; a spy on the original export would not intercept internal calls.
- `setupTestDb()` runs once at module level (real in-memory DB), while `freezeDate` is used per-test for deterministic ceiling math and restored via `jest.useRealTimers()` in `afterEach`.
- The `eventually` helper exists because the mailer is called fire-and-forget (not `await`ed) inside the service; tests that assert on `mockOutbox` must poll rather than assert immediately.
- Status precedence is asserted explicitly: a revoked key whose minter is also banned must still report `revoked`, not `suspended`.
