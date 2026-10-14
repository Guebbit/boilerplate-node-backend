---
source: src/modules/account/tests/integration/export.test.ts
sha256: 1e14e29c135ae814f810a15a7a00cc38603b60741ed308e8c5105b9138a60a16
generated_at: 2026-10-14T09:09:40.238125+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/export.test.ts

## Purpose

Integration test for the account data-export lifecycle: request → inline build → download → expiration/reaping. Uses real Mongo, a real temporary export directory, and the real services. The only fakes are the mail queue and the audit port (both captured into arrays for assertions). The HTTP/contract layer is covered separately in `contract/api.contract.test.ts`.

## Key elements

- **`mockOutbox`** / **`mockAudit`** — arrays capturing every enqueued email and audit record; reset in `beforeEach`, asserted per case. Installed via hoisted `jest.mock` on the mailer and audit modules.
- **`section(name, value)`** — factory for a `PersonalDataSection` that resolves a fixed value, used to keep tests independent of the real registry.
- **`basicSections()`** — the minimal valid section set (profile + cart) required by the export builder.
- **`requestFor(overrides?)`** — creates a verified user, calls `requestExport`, and unwraps the success; throws on refusal.
- **`fileOf(name)`** / **`downloadOf(userId, exportId)`** — read the built JSON file or stream a download via `openOwnExport`.
- **`gate()`** — returns a section whose `collect` promise is held open until the caller invokes `release()`, letting a test observe the `building` state before the worker completes.
- **`exportDueIn(email, millis)`** — produces a ready export and rewrites its `expiresAt` relative to now, for expiration/reaping tests.
- **`describe` blocks** cover: notifications scoped to the owner, users-module data (OAuth links, 2FA without secrets), `requestExport` status/shape, section resolution semantics (undefined omitted, subject passed through), mail content, audit recording, and (truncated) download/erasure/reaping behavior.

## Relationships

- **`src/modules/account/services/export.ts`** — primary SUT; imports `requestExport`, `openOwnExport`, `settleInlineExports`, `EXPORT_BUILD_LIMIT_MS`.
- **`src/modules/account/services/export-job.ts`** — `runExportJob` is the worker that writes the file (imported for direct invocation in edge cases).
- **`src/modules/account/services/export-rows.ts`** — `reapExpiredExports` exercised for the expiration path.
- **`src/modules/account/services/personal-data-registry.ts`** — `setPersonalDataSections` / `personalDataSections` swap the section list per case and restore it in `afterEach`.
- **`src/modules/account/model.ts`** / **`repository.ts`** — `accountExportModel` updates `expiresAt`; `accountExportRepository.findByUserId` asserts row state.
- **`src/modules/account/metrics.ts`** — `accountExportFailedTotal` imported for failure-path metric assertions.
- **`src/kernel/registry.ts`** — provides the `PersonalDataSection` type used by all section helpers.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `userRepository` seed accounts and OAuth links.
- **`src/modules/notifications/tests/factories.ts`** — `createNotification` seeds notification records scoped to a user.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the authenticated caller for every service call.
- **`src/infrastructure/adapters/logger.ts`** — imported (likely for spy/restore in failure tests).
- **`src/modules/users/index.ts`** — `userService` available for cross-module assertions.
- **`@tests/http`** (side-effect import) — builds the app, which triggers every module's `onRegistered` and installs the real section list and erasers.

## Notes

- **No broker in test runs** — every export build runs inline after the request resolves; `settleInlineExports()` is the substitute for "wait for the worker."
- **Importing `@tests/http` is load-bearing** — it causes the app to build, which calls `onRegistered` on all modules. Remove it and the real section list / erasers will not be installed.
- **`afterEach` ordering matters** — it settles any still-building exports, restores the original section list, restores all mocks, and removes the temp directory. Skipping `settleInlineExports` there can leak in-flight work into the next case.
- **`gate()` relies on synchronous executor assignment** — the `release` closure is set before the promise is returned; it is not safe to await the gate's promise from a different async context.
- **`mockOutbox` / `mockAudit` are declared `const` with `.length = 0` resets** (not reassignment) so the hoisted `jest.mock` factory can close over them.
- **`setPersonalDataSections` must be called before `requestExport`** in any case that uses custom sections; forgetting this makes the build use whatever the previous case left behind.
