---
source: src/modules/account/tests/unit/token-cleanup-job.test.ts
sha256: 3cda64ca91b7230aeeac8357dcfb70920f2cd8c3232e21a9c169de40fc5cdef4
generated_at: 2026-09-27T14:37:06.514404+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/token-cleanup-job.test.ts

## Purpose
Unit tests for `runTokenCleanup` (the unattended scheduled job that removes expired tokens) and `adminTokenCleanup` (its admin-triggered, audit-logged counterpart). Because the job runs unattended, the tests treat **log output as the observable contract**: every case asserts on what was logged, at which level, and the two branches (success / failure) are asserted mutually exclusive.

## Key elements
- **`describe('runTokenCleanup — the work')`** — verifies the job calls `userService.tokenRemoveExpired` exactly once and emits a "starting" log line.
- **`describe('runTokenCleanup — the success branch')`** — asserts `logger.info` contains "completed" and `logger.error` is **not** called.
- **`describe('runTokenCleanup — the failure branch')`** — asserts `logger.error` is called once with the original `Error` object (not a stringified payload), the job resolves `undefined` (never throws), and no "completed" info line appears.
- **`describe('…mutually exclusive')`** — a parameterised `it.each([[true],[false]])` table asserting that across both outcomes, exactly one of (info "completed", error call) fires (`completed + failed === 1`).
- **`describe('adminTokenCleanup — …')`** — asserts the admin path returns `{ success: true, data: { removed } }` and emits an audit event with `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP`; on failure returns `{ success: false, status: 500 }` and emits **no** audit event.
- **Mock setup** — three `jest.mock` blocks:
  - `@modules/users`: spreads the real module and `userService`, replacing only `tokenRemoveExpired` (keeps the barrel loadable).
  - `@infrastructure/adapters/logger`: replaces `info`/`error`/`warn` with `jest.fn()`.
  - `@infrastructure/observability/audit`: replaces `emitAuditEvent` and reroutes `recordAudit` through it (workaround for TS `__importStar` non-configurable getters that block `jest.spyOn`).
- **`CLEANUP_FAILURE`** — a named `Error('db failure')` instance referenced in both the failure branch and the mutual-exclusion table so assertions can point at the exact object.

## Relationships
- **`src/modules/account/services/token-cleanup.ts`** — source of `runTokenCleanup` and `accountService.adminTokenCleanup` under test.
- **`src/modules/account/services/index.ts`** — the barrel that re-exports both symbols; the `@modules/users` mock must keep the barrel (and its sibling `profile.ts` zod-schema construction) loadable.
- **`src/modules/users/index.ts` / `src/modules/users/service.ts`** — provides `userService.tokenRemoveExpired`, the sole behaviour that is mocked.
- **`src/infrastructure/adapters/logger.ts`** — fully mocked; all assertions on log level and message go through `mockedLogger`.
- **`src/infrastructure/observability/audit.ts`** — mocked to replace `emitAuditEvent` and reroute `recordAudit`; the admin-cleanup tests assert against this.
- **`src/modules/account/audit.ts`** — supplies `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP` used in the audit-event assertion.
- **`tests/support/callers.ts`** — provides `testCallerContext` for the `adminTokenCleanup` calls.

## Notes
- **Mocking strategy is deliberate:** the `@modules/users` mock spreads `jest.requireActual` rather than stubbing the whole module, because the `@modules/account/services` barrel evaluates every sibling at import time (e.g. `profile.ts` builds a zod schema from `zodUserSchema` at module scope). Omitting any export throws before tests run.
- **Audit mock vs. spy:** `jest.spyOn(auditPort, 'emitAuditEvent')` is unreliable here — TypeScript's CommonJS interop copies namespace properties as non-configurable getters, which `jest.spyOn` cannot redefine. Module-level mocking avoids this.
- **Error assertion uses `expect.objectContaining({ error: CLEANUP_FAILURE })`** rather than a stringified payload, because `JSON.stringify(new Error())` renders as `{}`. The raw `Error` instance is what the job actually passes.
- **The 500 status in the admin-failure assertion** is documented as being chosen by the service layer (see `token-cleanup.ts`), not replayed from a Mongoose error code.
- **Mutual-exclusion is the core mutation-coverage guarantee:** a naive "call it, assert service ran" test passes under both `if (success) → true` and `→ false` mutations. The paired `not.toHaveBeenCalled` / `not` assertions and the `it.each` table are what make the branch observable.
