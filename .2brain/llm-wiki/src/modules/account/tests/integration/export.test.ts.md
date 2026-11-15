---
source: src/modules/account/tests/integration/export.test.ts
sha256: b277416a7d4e5a23cbc685beea3d0c020209825e51600bf29f5404acb3dc4bf8
generated_at: 2026-11-14T19:03:45.949533+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/export.test.ts

## Purpose

Integration test for the account data-export job lifecycle: requesting an export, inline building (no broker), downloading, and expiration/reaping. It runs against a real Mongo instance and a real temporary export directory, exercising the actual services end-to-end. The only fakes are the mailer queue and the audit logger, both captured for assertions.

## Key elements

- **`mockOutbox` / `jest.mock('@infrastructure/adapters/mailer')`** – Captures every queued email (`to`, `template`, `data`) so tests can assert on the download-link notification.
- **`mockAudit` / `jest.mock('@infrastructure/observability/audit')`** – Captures audit events recorded during export operations.
- **`section(name, value)` / `basicSections()`** – Helpers to build a minimal valid `PersonalDataSection` list (profile + cart) for tests that don't need the real registry.
- **`requestFor(overrides?)`** – Creates a verified user and calls `requestExport`, unwrapping the success result.
- **`fileOf(name)` / `downloadOf(userId)`** – Read the built export file or stream it via `openOwnExport` for content assertions.
- **`gate()`** – Returns a section whose `collect` hangs until the caller invokes `release()`, enabling concurrency/ordering tests.
- **`exportDueIn(email, millis)`** – Produces a ready-state export with a controlled `expiresAt` for reaping tests.
- **`describe` blocks** – Cover: notifications-module content isolation, users-module content (OAuth + 2FA without secrets), profile schema `select:false` exclusion, `requestExport` 202→ready flow, and (truncated) erasure/reaping behavior.
- **`settleInlineExports`** (from `src/modules/account/services/export.ts`) – The "wait for the worker" step; since no message broker is running, builds execute inline and this flushes them.
- **`import '@tests/http'`** – Side-effect import that boots the app, triggering every module's `onRegistered` hook to install the real section list and erasers.

## Relationships

- **`src/modules/account/services/export.ts`** – Source of `requestExport`, `openOwnExport`, `readOwnExport`, `settleInlineExports`; the primary API under test.
- **`src/modules/account/services/export-job.ts`** – `runExportJob` is the inline build worker invoked when no broker is present.
- **`src/modules/account/services/export-rows.ts`** – `reapExpiredExports` exercises the expiration/cleanup path.
- **`src/modules/account/services/personal-data-registry.ts`** – `setPersonalDataSections` / `personalDataSections` let tests swap in or restore the section list.
- **`src/modules/account/model.ts`** – `accountExportModel.updateOne` manipulates `expiresAt` directly for deadline-control tests.
- **`src/modules/account/repository.ts`** – `accountExportRepository.findByUserId` asserts row state after a build.
- **`src/modules/account/metrics.ts`** – `accountExportFailedTotal` is imported for failure-path metric assertions.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `userRepository`, `eraseAsScheduled` seed and clean up user fixtures.
- **`src/modules/users/friends/account.ts`** – `accountUserService` provides the real section collector for the users module.
- **`src/modules/notifications/tests/factories.ts`** – `createNotification` seeds notification documents to verify export scoping.
- **`src/kernel/outbox.ts`** – `outboxEventModel` queried to confirm outbox events are emitted on state transitions.
- **`src/kernel/registry.ts`** – `PersonalDataSection` type used by all section helpers.
- **`src/infrastructure/adapters/logger.ts`** – Imported (likely for spy/assertion on structured log output).
- **`tests/support/callers.ts`** – `testCallerContext` supplies the authenticated caller for every service call.

## Notes

- No message broker exists in the test environment, so every export build runs synchronously inline; `settleInlineExports()` must be called after each request before asserting on the file.
- `mockOutbox` is deliberately prefixed with `mock` so the hoisted `jest.mock` factory can reference it without a `ReferenceError`.
- The `@tests/http` import is a **side-effect-only** import: it builds the app and runs `onRegistered` hooks. Tests that need the *real* section list rely on this and must not call `setPersonalDataSections` before reading.
- The HTTP-layer contract (status codes, auth, body shape) is intentionally excluded here and lives in `contract/api.contract.test.ts`; this file tests service-level behavior and file content.
- A fresh `mkdtemp` directory is created per test (`beforeEach`) and removed in `afterEach`; `NODE_ACCOUNT_EXPORT_STORE_PATH` is pointed at it via `setEnvironment`.
- The profile-section test verifies that **every** Mongoose `select: false` field is absent from the export JSON, using distinctive `marker-` values as a safety net against accidental leaks.
