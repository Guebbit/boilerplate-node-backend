# src/modules/account/tests/unit/token-cleanup-job.test.ts

## Purpose

Unit tests for `runTokenCleanup` (the scheduled, unattended job) and `adminTokenCleanup` (its admin-triggered, audited counterpart). Because the job's only observable output is its log line, every test asserts on `logger` calls rather than (or in addition to) repository invocations, and explicitly pins the success and failure branches as mutually exclusive.

## Key elements

- **`describe('runTokenCleanup — the work')`** — verifies the repository is called once and that a "starting" info line is emitted before the outcome is known.
- **`describe('runTokenCleanup — the success branch')`** — asserts an info-level "completed" message appears and that **no** error-level message is emitted.
- **`describe('runTokenCleanup — the failure branch')`** — asserts an error-level message (carrying the cause, e.g. "db failure") is emitted, that the function still resolves (never throws), and that no "completed" info message appears.
- **`describe('… mutually exclusive')`** — a single `it.each([[true],[false]])` case that asserts exactly one of the two log paths fires per run (`completed + failed === 1`).
- **`describe('adminTokenCleanup …')`** — exercises `accountService.adminTokenCleanup(testCallerContext)` and asserts the audit event (`accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP`) fires on success and is absent on failure; also pins the `{ success: false, status: 500 }` shape.
- **`infoMessages()` / `errorMessages()`** — local helpers that flatten the mocked logger call args into a string array for substring assertions.
- **Mocks** — `userRepository.tokenRemoveExpired` (jest.fn), `logger.{info,error,warn}`, `auditPort.emitAuditEvent`.

## Relationships

- **`src/modules/account/services/token-cleanup.ts`** — the module under test; provides `runTokenCleanup` and `accountService.adminTokenCleanup`.
- **`src/modules/account/services/index.ts`** — barrel through which the test imports both functions (importing here forces evaluation of sibling services at load time, which constrains how the users module can be mocked).
- **`src/modules/users/index.ts` / `src/modules/users/repository.ts`** — source of `userRepository`; only `tokenRemoveExpired` is replaced, the rest is spread from the real module.
- **`src/infrastructure/adapters/logger.ts`** — fully mocked; the test's primary assertion target.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` is module-mocked (see Notes) to verify the audit trail on the admin path.
- **`src/modules/account/audit.ts`** — provides `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP` used in the audit assertion.
- **`tests/support/caller-context.ts`** — provides `testCallerContext` passed to `adminTokenCleanup`.

## Notes

- **Barrel-load constraint:** `jest.mock('@modules/users')` must spread `jest.requireActual` because the services barrel (`index.ts`) eagerly evaluates `profile.ts`, which builds a zod schema from `zodUserSchema` at module scope. A bare mock would throw before any test runs.
- **Why `emitAuditEvent` is module-mocked, not `jest.spyOn`'d:** TypeScript's `__importStar` interop copies namespace-import properties as non-configurable getters, which `jest.spyOn` cannot redefine (works under some transpile paths but fails under Stryker's mutation sandbox). A full `jest.mock` gives a plain, configurable `jest.fn()`.
- **Assertions target logs, not just repo calls:** the file's header explicitly states that the log line *is* the observable behaviour for an unattended job; a test that only checks the repo call passes in both branches (near-zero mutation coverage).
- **Non-throwing contract:** the "does not let the sweep fail" test encodes the requirement that `runTokenCleanup` always resolves, because login and refresh invoke it as a pre-flight step.
- **Audit-only-on-success:** `adminTokenCleanup` is expected to emit an audit event on success and emit **none** on failure — a deliberate "nothing to report" policy.
