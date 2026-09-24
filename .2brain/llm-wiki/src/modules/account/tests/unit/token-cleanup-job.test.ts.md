---
source: src/modules/account/tests/unit/token-cleanup-job.test.ts
sha256: 711622e5392ba0b9803da31a7e9be6ecbd562fe2ccbc3d2da31402674402e355
generated_at: 2026-09-23T18:17:13.180452+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/token-cleanup-job.test.ts

## Purpose

Unit tests for the `runTokenCleanup` scheduled job and its admin-triggered counterpart `adminTokenCleanup`. Because the job runs unattended, its log output is the only operator-visible signal; every assertion therefore targets `logger.info` / `logger.error` calls rather than return values, and the success/failure branches are verified as mutually exclusive.

## Key elements

- **`infoMessages()`** — helper that flattens all `logger.info` mock calls into a string array for substring assertions.
- **`mockTokenRemoveExpired`** — typed handle to the single spied method on `userService`; every test sets `mockResolvedValueOnce` or `mockRejectedValueOnce` before invoking the job.
- **`CLEANUP_FAILURE`** — named `Error` instance injected into the failure branch so assertions can point at the exact object.
- **`describe('runTokenCleanup — the two branches are mutually exclusive')`** — `it.each([[true],[false]])` table that asserts `completed + failed === 1` regardless of outcome; this is the core mutation-detection guard.
- **`describe('adminTokenCleanup')`** — verifies the audited admin path: success emits an audit event with `AUTH_TOKEN_EXPIRED_CLEANUP`; failure returns `{ success: false, status: 500 }` and emits **no** audit event.
- **Three `jest.mock` blocks** — `@modules/users`, `@infrastructure/adapters/logger`, `@infrastructure/observability/audit` (details in Notes).

## Relationships

- **`@modules/users` → `userService.tokenRemoveExpired`** — the only production method under test; mocked via partial spread (see Notes).
- **`@modules/account/services` → `runTokenCleanup`, `accountService`** — the SUTs; imported from the barrel, which forces all sibling service modules to load.
- **`@infrastructure/adapters/logger`** — fully mocked; all log-level and message assertions go through `mockedLogger`.
- **`@infrastructure/observability/audit`** — mocked to replace `emitAuditEvent`; `recordAudit` is re-routed through the replacement so spies see both direct and indirect calls.
- **`../../audit` → `accountAuditActions`** — provides the `AUTH_TOKEN_EXPIRED_CLEANUP` enum value used in the admin audit assertion.
- **`tests/support/callers` → `testCallerContext`** — supplies the caller context object passed to `accountService.adminTokenCleanup`.

## Notes

- **Partial `@modules/users` mock.** The barrel (`@modules/account/services`) evaluates every sibling service at import time; `profile.ts` builds a zod schema from `zodUserSchema` at module scope. Spreading `jest.requireActual` into the mock keeps all siblings loadable while replacing only `tokenRemoveExpired`.
- **`jest.mock` instead of `jest.spyOn` for audit.** TypeScript's CommonJS `__importStar` interop copies namespace properties as non-configurable getters, which `jest.spyOn` cannot redefine. A full `jest.mock` replaces them with plain `jest.fn()`s. The mock also re-implements `recordAudit` to route through the replaced `emitAuditEvent` (the real `recordAudit` closes over its own module's binding and would be immune to the override).
- **Error object asserted by reference, not string.** `JSON.stringify(Error)` yields `{}`, so the test asserts `expect.objectContaining({ error: CLEANUP_FAILURE })` on the raw value — this is the same reason `redactFormat` serialises errors before transport.
- **`beforeEach` calls `jest.clearAllMocks()`**; each test then sets its own `mockResolvedValueOnce` / `mockRejectedValueOnce`, so no stale state leaks between cases.
