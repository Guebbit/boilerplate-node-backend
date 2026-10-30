---
source: src/modules/account/tests/integration/export.test.ts
sha256: cb1f75c5716c4baf3fe025c5ae3ee8f088968abebbf895259a8dca6c9dd8e001
generated_at: 2026-10-29T02:55:33.739610+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/export.test.ts

## Purpose

Integration test for the account data-export lifecycle: request → inline build → download → erasure/reaper. It exercises the real services, real Mongo, and a real temporary export directory; the only fakes are the mail enqueue (captured into `mockOutbox`) and the audit recorder (captured into `mockAudit`). It covers the service-level flow; the HTTP layer of the same flow lives in `contract/api.contract.test.ts`.

## Key elements

- **`mockOutbox` / `mockAudit`** – Module-level arrays capturing every queued email and audit event; `jest.mock`-ed mailer and audit modules push into them.
- **`section(name, value)` / `basicSections()`** – Helpers that build minimal `PersonalDataSection` arrays for tests that swap the registry.
- **`requestFor(overrides?)`** – Creates a verified user via `createUser`, calls `requestExport`, unwraps the success result.
- **`fileOf(name)` / `downloadOf(userId)`** – Read the written JSON file or stream the `openOwnExport` download.
- **`gate()`** – Returns a `PersonalDataSection` whose `collect` promise never resolves until `release()` is called; used to hold a build open in concurrency tests.
- **`exportDueIn(email, millis)`** – Creates a ready export and rewrites its `expiresAt` to a relative offset from now.
- **`describe` blocks** – Notifications scoping, users-module content (providers, 2FA, secret exclusion), profile `select:false` field exclusion, `requestExport` 202/ready transition + outbox event, and (in the truncated portion) download, erasure, and reaper paths.

## Relationships

| Neighbor | Interaction |
|---|---|
| `services/export.ts` | Calls `requestExport`, `openOwnExport`, `readOwnExport`, `settleInlineExports` |
| `services/export-job.ts` | Calls `runExportJob` (worker entry) |
| `services/export-rows.ts` | Calls `reapExpiredExports` (reaper) |
| `services/personal-data-registry.ts` | Reads `personalDataSections()`; swaps via `setPersonalDataSections` in `beforeEach`/`afterEach` |
| `model.ts` / `repository.ts` | Asserts row state via `accountExportModel` and `accountExportRepository` |
| `metrics.ts` | Imports `accountExportFailedTotal` for failure-path assertions |
| `kernel/outbox.ts` | Queries `outboxEventModel` to verify `account.export_ready` events |
| `kernel/registry.ts` | Imports the `PersonalDataSection` type for the section helpers |
| `users/tests/factories.ts` | `createUser`, `eraseAsScheduled` seed test accounts |
| `users/repository.ts` | `userRepository` links OAuth accounts and writes `select:false` fields directly |
| `users/index.ts` | `userService` used by the real section collectors |
| `notifications/tests/factories.ts` | `createNotification` seeds user-owned and stranger notifications |
| `infrastructure/adapters/logger.ts` | `logger` imported (likely for spy setup or assertion on log output) |
| `infrastructure/adapters/mailer` (mocked) | `enqueueEmail` replaced with a capture-into-`mockOutbox` stub |

## Notes

- **No broker in the test run.** Every export build runs inline after `requestExport` resolves; `settleInlineExports()` is the explicit "wait for the worker" step called in assertions and `afterEach`.
- **Hoisted `jest.mock` closures.** Because `jest.mock` calls are hoisted above imports, the capture arrays are named `mockOutbox` / `mockAudit` (the `mock` prefix lets the factory close over them without a `ReferenceError`).
- **`@tests/http` import is side-effect-only.** Importing it builds the app and triggers every module's `onRegistered`, which installs the real personal-data section list and erasers. Tests that swap sections must restore the originals in `afterEach`.
- **`gate()` timing trick.** The `release` function is assigned inside the `new Promise` executor (synchronous), so the returned object is safe to destructure immediately.
- **`afterEach` order matters.** `settleInlineExports()` runs before `rm(root, …)` so in-flight builds finish writing before the directory is torn down.
