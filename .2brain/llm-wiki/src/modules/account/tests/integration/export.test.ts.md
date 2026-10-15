---
source: src/modules/account/tests/integration/export.test.ts
sha256: 61175be106d623763a8c9c69d4c2c1b756b8e057fd3d96898be1cc7ae9d6e0c7
generated_at: 2026-10-15T10:11:19.395442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/export.test.ts

## Purpose

Integration test for the full account data-export lifecycle: requesting an export (row recorded, build queued), the worker writing the JSON file and mailing a link, downloading/streaming the file to its owner, and erasure/reaping. It exercises real Mongo, a real temporary export directory, and the real account/users/notifications services. The only fakes are the mail queue (captured into `mockOutbox`) and the audit port (captured into `mockAudit`). Because no message broker is available in the test run, every build executes inline; `settleInlineExports` serves as the "wait for the worker" step.

## Key elements

- **`mockOutbox` / `mockAudit`** – module-level arrays that capture every queued email and audit event. Prefixed with `mock` so the hoisted `jest.mock` factories can reference them via closure.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a stub that pushes to `mockOutbox`; all other mailer exports remain real.
- **`jest.mock('@infrastructure/observability/audit')`** – replaces `recordAudit` with a stub that pushes to `mockAudit`; other audit exports remain real.
- **`section(name, value)`** – factory for a `PersonalDataSection` that resolves a fixed value.
- **`basicSections()`** – returns the minimal two-section list (profile + cart) needed for a valid export.
- **`requestFor(overrides?)`** – creates a verified user, calls `requestExport`, and unwraps the success result.
- **`fileOf(name)`** – reads the finished export JSON from the temp directory.
- **`downloadOf(userId, exportId)`** – calls `openOwnExport` and consumes the resulting stream to a string (or `undefined`).
- **`gate()`** – returns a section whose `collect` promise stays open until the test calls `release()`, used to hold a build mid-flight.
- **`exportDueIn(email, millis)`** – creates a ready export and shifts its `expiresAt` relative to now (negative = already due).
- **`describe` blocks** – cover notifications-module content, users-module content (providers, 2FA, secret exclusion), `requestExport` semantics (202 → building → ready, JSON shape, subject passthrough, mail content, audit recording), and (truncated) erasure/reaping.

## Relationships

- **`@modules/account/services/export`** – primary subject: `requestExport`, `openOwnExport`, `settleInlineExports`.
- **`@modules/account/services/export-job`** – `runExportJob` (imported for potential direct invocation or for the inline-build path).
- **`@modules/account/services/export-rows`** – `reapExpiredExports` (the reaper path tested in the erasure suite).
- **`@modules/account/services/personal-data-registry`** – `setPersonalDataSections` / `personalDataSections` to swap section lists per case and restore them after.
- **`@modules/account/repository`** – `accountExportRepository.findByUserId` to assert row state.
- **`@modules/account/model`** – `accountExportModel.updateOne` to manipulate `expiresAt` directly.
- **`@modules/account/metrics`** – `accountExportFailedTotal` (imported; likely asserted in failure-path tests in the truncated portion).
- **`@kernel/registry`** – `PersonalDataSection` type and the registry contract the sections implement.
- **`@modules/users/tests/factories`** – `createUser`, `userRepository` (user fixture and direct repo for `linkOAuthAccount`).
- **`@modules/users`** – `userService` (imported for the users-module section that the real registry installs).
- **`@modules/notifications/tests/factories`** – `createNotification` to seed notification documents.
- **`@infrastructure/adapters/logger`** – `logger` (imported; likely for spy/restoration in failure cases).
- **`tests/support/callers`** – `testCallerContext` supplied as the caller argument to every service call.
- **`@tests/http`** – importing it builds the full app, which triggers every module's `onRegistered` hook, installing the real personal-data section list and the real erasers before any test runs.

## Notes

- **No broker ⇒ inline builds.** `settleInlineExports` must be awaited after every `requestExport` before asserting on the file or row status; forgetting it is the most common source of flaky failures here.
- **`@tests/http` import is a side-effect import.** It is not used for its exports; it exists solely to run the app bootstrap (section registry, erasers). Removing it would silently break any test that relies on the real section list.
- **Section swap discipline.** `beforeEach` does *not* reset sections; `afterEach` restores `originalSections`. Tests that call `setPersonalDataSections` are responsible for the swap, and the gate pattern (`gate()`) relies on synchronous executor assignment before the returned promise is handed back.
- **`mockOutbox` / `mockAudit` naming.** The `mock` prefix is required because Jest hoists `jest.mock` above `const` declarations; the factories close over the variables by reference. Renaming without the `mock` prefix will trigger a reference error at runtime.
- **Temp directory is per-case.** Each `beforeEach` creates a fresh `mkdtemp` under the OS tmp dir; `afterEach` removes it recursively. Tests must read files via `fileOf` (which uses the case-local `root`), not via a hardcoded path.
- **The HTTP/contract side is covered elsewhere** in `contract/api.contract.test.ts`; this file only exercises the service-level flow.
