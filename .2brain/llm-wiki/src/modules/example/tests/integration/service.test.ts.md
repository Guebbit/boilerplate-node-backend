---
source: src/modules/example/tests/integration/service.test.ts
sha256: 9b475640877b3eff73befc099bae7e00bacbbe4c5cc34c51a2622141d2d8b138
generated_at: 2026-10-14T15:47:45.019975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/service.test.ts

## Purpose
Integration tests for the example service CRUD operations run against a real database. Verifies ownership scoping (own / any / nothing), status-lifecycle enforcement on write, one-time `publishedAt` stamping, exactly-once publish announcement via the outbox, body-ceiling enforcement from the environment, and that audit/analytics events fire on create.

## Key elements
- **Jest mocks (top-level):** Replaces `auditPort.emitAuditEvent` and `analyticsPort.emitAnalyticsEvent` with jest.fn() implementations. The audit mock also reroutes `recordAudit` so it delegates to the replaced `emitAuditEvent`.
- **`aCustomer(username?)`** – Creates a real user row and returns `{ user, context }` with a customer-role caller context.
- **`anAdmin()`** – Same for an administrator holding `examples.*` keys.
- **`anotherAdmin()`** – Creates a second admin (for peer-admin permission tests).
- **`describe('create')`** – Trimming, 401 without identity, 422 over body ceiling, exact-ceiling acceptance, audit emission.
- **`describe('who may read what')`** – Owner reads own draft; stranger gets `null` (not 404); admin with `examples.any.read` reads anyone's; missing id → `null`.
- **`describe('getPublishedById')`** – Public endpoint: returns published rows for any caller; returns `null` for draft/archived (same as missing).
- **`describe('search')`** – Own-only vs. all for admins, status filter, full-text in title/body, empty result when caller holds no examples key.
- **`describe('update')`** – Owner edit + trimming, 404 for stranger, admin-with-`any.update` edits anyone's, **403 for admin editing peer admin's row**, illegal status transition → 422 (truncated in file).
- **`afterEach`** – Calls `resetDomainEvents()` and `jest.clearAllMocks()`.

## Relationships
- **`src/modules/example/services/index.ts`** – Imports the six service functions under test (`create`, `getById`, `getPublishedById`, `search`, `update`, `remove`).
- **`src/modules/example/repository.ts`** – Used directly for ground-truth assertions (`count()`, field reads) without going through the service.
- **`src/modules/example/audit.ts` / `events.ts`** – Provides `exampleAuditActions` and `EXAMPLE_PUBLISHED` constants asserted in expectations.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` for observing published announcements.
- **`src/kernel/outbox.ts`** – `outboxEventModel`, `settleOutboxNudges` to assert exactly-once outbox writes.
- **`src/infrastructure/observability/audit.ts` / `analytics/index.ts`** – Mocked at the module level; their `emitAuditEvent` / `emitAnalyticsEvent` are the observation points.
- **`src/modules/example/tests/factories.ts`** – `createExample` (seeds DB rows) and `fieldOf` (direct column read).
- **`src/modules/users/tests/factories.ts`** – `createUser` to seed real identity rows.
- **`tests/support/environment.ts`** – `withEnvironment` to override `NODE_EXAMPLE_BODY_MAX_LENGTH` per-test.
- **`tests/support/callers.ts`** – `callerContextAs`, `testCallerContext` for role/identity simulation.
- **`tests/support/ids.ts`** – `MISSING_ID` sentinel for not-found assertions.
- **`src/types/index.ts`** – `ExampleStatus` enum values used in fixtures and expectations.

## Notes
- Audit and analytics ports are **replaced** via `jest.mock` factory, not spied with `jest.spyOn`. The file comment explains why: the CJS namespace import exposes a non-configurable getter that `spyOn` cannot redefine.
- `getById` returns `null` (not a 404 rejection) when the row belongs to another user; `update` returns a 404 rejection in the same situation. `search` returns an empty list when the caller holds no examples permission key (not 401).
- The "peer admin" test (403) is a deliberate rank rule: an admin cannot edit another admin's example, even though both hold `examples.any.update`.
- `getPublishedById` requires **no caller context** in the signature — it is a public read path gated solely on `status === published`.
- The file is truncated in the source snapshot; the `update` describe block and any `remove`/publish lifecycle tests beyond what is shown are not documented here.
