# src/modules/account/tests/unit/token-cleanup-job.test.ts

## Purpose

Unit tests for the `runTokenCleanup` scheduled job and its `adminTokenCleanup` service counterpart. Rather than asserting "the repository method was called" (true in both branches), the tests assert on **log output** — which level, which message — because the log line is the job's only observable contract for an unattended process. The two branches (resolve vs. reject from `tokenRemoveExpired`) are pinned as mutually exclusive: exactly one of "completed at info" or "failure at error" may appear.

## Key elements

- **`jest.mock('@modules/users')`** — Spreads the real barrel (required so sibling services like `profile.ts` can evaluate their module-scope zod schemas) and replaces only `userRepository.tokenRemoveExpired` with a `jest.fn()`.
- **`jest.mock('@infrastructure/adapters/logger')`** — Replaces `logger.info`/`.error`/`.warn` with `jest.fn()` so tests can assert on call count, level, and message content.
- **`jest.mock('@infrastructure/observability/audit')`** — Replaces `emitAuditEvent` at module level (avoids the `__importStar` non-configurable-getter problem that blocks `jest.spyOn` on namespace imports, especially under Stryker).
- **`infoMessages()` / `errorMessages()` helpers** — Flatten mock call args into strings for substring assertions.
- **`describe('runTokenCleanup — the work')`** — Verifies the repository is called exactly once and that a "starting" line is logged before the outcome is known.
- **`describe('… — the success branch')`** — Asserts an info-level "completed" line and *absence* of any error-level call.
- **`describe('… — the failure branch')`** — Asserts an error-level call carrying the rejection reason, no "completed" line, and that `runTokenCleanup()` still resolves (does not throw to the caller, which may be a login pre-flight).
- **`describe('… — the two branches are mutually exclusive')`** — `it.each` over `[true, false]`; asserts `completed + failed === 1`. This is the case that fails if `if (success)` is forced to either constant.
- **`describe('adminTokenCleanup — …')`** — Exercises `accountService.adminTokenCleanup(testCallerContext)`: on success expects `{ success: true, data: { removed: n } }` and an audit event with `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP` / `outcome: 'success'`; on failure expects `{ success: false, status: 500 }` and **no** audit event.

## Relationships

- **`src/modules/account/services/token-cleanup.ts`** — The implementation under test (`runTokenCleanup`, and the `adminTokenCleanup` method on the account service).
- **`src/modules/account/services/index.ts`** — Barrel through which both the job and `accountService` are imported; its module-scope evaluation of sibling services is why the `@modules/users` mock must spread the real module.
- **`src/infrastructure/adapters/logger.ts`** — The primary assertion target; every test case inspects its `info`/`error` call history.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` is the audited side-effect of the admin path; mocked so tests can verify it was or wasn't called.
- **`src/modules/account/audit.ts`** — Source of the `accountAuditActions` enum used in the admin audit assertions.
- **`src/modules/users/index.ts` / `src/modules/users/repository.ts`** — Provide `userRepository.tokenRemoveExpired`, the single external dependency of the job.
- **`tests/support/caller-context.ts`** — Supplies the `testCallerContext` argument required by `adminTokenCleanup`.

## Notes

- **Why mock the whole `@modules/users` barrel instead of spying on the repository method?** The services barrel evaluates `profile.ts` at import time, which builds a zod schema from `zodUserSchema`. A bare mock that omits that symbol throws before any test runs. Spreading `requireActual` preserves loadability.
- **Why mock `audit` at module level rather than `jest.spyOn`?** TypeScript's `__importStar` interop copies namespace properties as non-configurable getters; `jest.spyOn` cannot redefine them. Module-level mocking yields a plain, always-replaceable `jest.fn()`. This matters under Stryker's instrumented sandbox.
- **Branch observability strategy:** The tests are structured so that mutating `if (success)` to a constant breaks at least one assertion in each branch (the "no error" / "no completed" negative assertions), rather than relying on the positive assertion alone.
- **The `500` status in the failure case is set by the service** (`token-cleanup.ts`), not replayed from a Mongoose static — the comment explicitly notes this decoupling.
