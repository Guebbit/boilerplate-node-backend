---
source: src/modules/account/tests/integration/export.test.ts
sha256: f3c5690d901062d1c44279c82e3b7bff0b9b6db697dbd2e6064a99e655cf9f53
generated_at: 2026-11-08T04:36:36.400680+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/export.test.ts

## Purpose

Integration test for the full data-export job lifecycle—request, inline build, download, and erasure/reaping—against a real Mongo instance and a real temporary filesystem directory. It verifies what content lands in the export file (notifications, users-module data, profile) and which sensitive fields are stripped, while faking only the mail queue and audit port.

## Key elements

- **`mockOutbox`** — array capturing every `enqueueEmail` call (mocked via `jest.mock` on the mailer adapter).
- **`mockAudit`** — array capturing every `recordAudit` call (mocked via `jest.mock` on the audit module).
- **`section(name, value)`** — builds a `PersonalDataSection` that resolves to a fixed value.
- **`basicSections()`** — returns the minimal two-section list (`profile` + `cart`) needed for a valid export.
- **`requestFor(overrides?)`** — creates a verified user and calls `requestExport`, asserting success.
- **`fileOf(name)`** — reads the export JSON file from the per-case temp directory.
- **`downloadOf(userId)`** — calls `openOwnExport` and collects the streamed body.
- **`gate()`** — returns a section whose `collect` awaits a caller-controlled `release` promise, used to test concurrent/in-flight builds.
- **`exportDueIn(email, millis)`** — creates a ready export and shifts its `expiresAt` by the given offset.
- **`describe` blocks** — cover: notifications module content, users-module content (OAuth + 2FA with secret-leak check), profile section field-stripping, `requestExport` 202→ready transition, and (truncated) further job/reaper/erasure scenarios.

## Relationships

- **`src/modules/account/services/export.ts`** — primary system under test; provides `requestExport`, `settleInlineExports`, `openOwnExport`, `readOwnExport`.
- **`src/modules/account/services/export-job.ts`** — `runExportJob` is the inline worker the test exercises.
- **`src/modules/account/services/export-rows.ts`** — `reapExpiredExports` tested for the cleanup path.
- **`src/modules/account/services/personal-data-registry.ts`** — `setPersonalDataSections` / `personalDataSections` used to swap section lists per case.
- **`src/modules/account/repository.ts`** — `accountExportRepository.findByUserId` to assert row state.
- **`src/modules/account/model.ts`** — `accountExportModel.updateOne` to manipulate `expiresAt`.
- **`src/modules/account/metrics.ts`** — `accountExportFailedTotal` asserted in failure-path tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` queried to verify `account.export_ready` events were enqueued.
- **`src/kernel/registry.ts`** — `PersonalDataSection` type used by helpers.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `eraseAsScheduled`, `userRepository` for fixture setup and OAuth linking.
- **`src/modules/users/index.ts`** — `userService` exercised indirectly through the real app build.
- **`src/modules/notifications/tests/factories.ts`** — `createNotification` to seed notifications for content assertions.
- **`@tests/http`** (imported for side effect) — builds the full app, triggering every module's `onRegistered` hook so the real section list and erasers are installed.

## Notes

- No message broker is available in the test environment; every build runs **inline** after the request resolves. `settleInlineExports()` is the explicit "wait for the worker" barrier—call it after `requestExport` before asserting row status or file content.
- The `mock*` naming on `mockOutbox` / `mockAudit` is deliberate: the hoisted `jest.mock` factory closes over those variables, so they must be declared at module scope (not inside `beforeEach`).
- Importing `@tests/http` is load-bearing—it installs the real personal-data sections and erasers. Do not remove it or section-dependent tests will silently fail.
- The `gate()` helper relies on the promise executor running synchronously to capture `release` before `gate()` returns; this is a deliberate timing trick, not a race.
- The HTTP contract layer of the same flow is covered separately in `contract/api.contract.test.ts`; this file focuses on service/repository behavior.
