---
source: src/modules/account/tests/integration/export.test.ts
source_sha256: acfe20fae7ae234fca60f616abcbbcfc96f54c60bba3e0de3879dc313dc25c95
context_sha256: 78500eea51614cbdd633d42ac139922e0ae6efffcec1c061d98ee96acd71cb35
generated_at: 2026-11-22T03:55:16.850026+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/export.test.ts

## Purpose
Integration tests for the account data export as an asynchronous job: requesting an export records a row and queues a build, the worker writes the file and mails a link, a download streams it to its owner, and erasure and the reaper remove row and file together. It runs against real Mongo, a real temporary export directory and the real services. Only the mail queue and the audit port are faked (both captured). The HTTP side of the same flow is covered by `src/modules/shop/tests/contract/api.contract.test.ts`.

## Key elements
- **`mockOutbox` / `jest.mock('@infrastructure/adapters/mailer')`**: replaces `enqueueEmail` and records `{ to, template, data, urgent }` for each mail.
- **`mockAudit` / `jest.mock('@infrastructure/observability/audit')`**: replaces `recordAudit` and captures the fields of each audit event (only when a context is given).
- **`setupTestDb()`**: sets up the database for the suite.
- **`beforeEach` / `afterEach`**: create a temp dir in `root` and point `NODE_ACCOUNT_EXPORT_STORE_PATH` at it. They clear the captures, call `settleInlineExports()`, restore the original personal-data sections, restore mocks and delete the dir.
- **Helpers**:
  - `section(name, value)` builds a fixed-answer `PersonalDataSection`.
  - `basicSections()` returns a profile section plus a cart section.
  - `requestFor(overrides)` creates a verified user and calls `requestExport`, unwrapping the success.
  - `fileOf(name)` reads a finished export file from `root`.
  - `downloadOf(userId)` streams `openOwnExport` to text, or returns `undefined` if there is nothing to send.
  - `gate()` returns a section that holds the build until `release()` is called.
  - `exportDueIn(email, millis)` makes a ready export and moves its `expiresAt` (a negative value means already due).
- **Test groups visible**:
  - Notifications section: the export lists the account's own notifications and nobody else's.
  - Users section: linked OAuth providers and enrolled 2FA methods appear, with no secret.
  - Profile section: none of the `select: false` fields (password, backup codes, reauth code, MFA lockout, `tokensValidAfter` and similar) appear, checked with marker values.
  - `requestExport`: answers 202 with a `building` row, which the worker then makes `ready`.

  The file continues beyond this, with further cases that use the imports listed under Relationships.

## Relationships
- **`@tests/http`** (imported for side effects): builds the app, which runs every module's `onRegistered` and installs the real section list and erasers. This is why the notifications and users section tests use the real list.
- **`src/modules/account/services/export.ts`**: supplies `requestExport`, `openOwnExport`, `readOwnExport` and `settleInlineExports`, the "wait for the worker" step.
- **`src/modules/account/services/export-job.ts`** (`runExportJob`) and **`src/modules/account/services/export-rows.ts`** (`reapExpiredExports`): imported to drive the build and the reaper directly.
- **`src/modules/account/services/personal-data-registry.ts`**: `personalDataSections` and `setPersonalDataSections` let cases swap sections and put them back.
- **`src/kernel/registry.ts`**: provides the `PersonalDataSection` type.
- **`src/modules/account/repository.ts`, `src/modules/account/model.ts`, `src/modules/account/metrics.ts`**: `accountExportRepository`, `accountExportModel` and `accountExportFailedTotal` are used to inspect rows, edit deadlines and check the failure metric.
- **`src/kernel/outbox.ts`**: `outboxEventModel` is imported, so tests can inspect outbox events.
- **`src/infrastructure/adapters/logger.ts`**: `logger` is imported, so tests can check logging.
- **`src/modules/users/tests/factories.ts`, `src/modules/users/friends/account.ts`, `src/modules/users/repository.ts`, `src/modules/notifications/tests/factories.ts`, `tests/support/callers.ts`**: supply `createUser`, `eraseAsScheduled`, `userRepository`, `accountUserService`, `createNotification` and `testCallerContext`.

## Notes
- No broker runs in tests, so builds run inline after the request resolves. Cases must `await settleInlineExports()` before asserting on the finished state, and `afterEach` also settles any leftover builds.
- The mocks are named `mock*` so the hoisted `jest.mock` factories may close over them.
- Cases that don't use the real section list install their own with `setPersonalDataSections`, which `afterEach` reverts.
