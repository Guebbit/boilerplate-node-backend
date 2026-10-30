---
source: src/modules/example/tests/integration/service.test.ts
sha256: 1c66be47d25a08f50349024b65df296f25d6a3d610251b0c9f95491f38234627
generated_at: 2026-10-29T03:57:47.026598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/service.test.ts

## Purpose

Integration tests that exercise `exampleService` against a **real database** (`setupTestDb`). They verify ownership scoping (own / any / nothing), the status lifecycle enforced on write, single-stamping of `publishedAt`, exactly-once publish announcement via the outbox, and the environment-driven body-length ceiling.

## Key elements

- **`jest.mock` (audit & analytics ports)** — Replaces the entire port module with a mock factory so calls can be asserted without `jest.spyOn` (see Notes).
- **`aCustomer(username?)`** — Creates a real user row and returns `{ user, context }` with an `editor` caller context.
- **`anAdmin()` / `anotherAdmin()`** — Create admin-role users; `anotherAdmin` is a second peer for multi-admin scenarios.
- **`describe('create')`** — Trimming, 401 for anonymous, 422 for body over ceiling, acceptance at exact ceiling, audit emission with `EXAMPLE_CREATED`.
- **`describe('who may read what')`** — `getById` returns the row for the owner, `null` (not a refusal) for a stranger, the full row for an admin with `display:Example`, and `null` for a nonexistent id.
- **`describe('getById on a published example')`** — Published rows are visible to anyone (including anonymous); draft/archived rows are invisible to strangers.
- **`describe('search')`** — Ownership scoping, admin-wide listing with per-row `ownerName`, status filter, full-text search across title+body, empty result for keyless caller.
- **`describe('updateById')`** — Audit records only *changed* field names; trimming on write; 404 for another user's row (untouched); admin bypass via `admin:Example`.
- **(truncated)** — Remaining suites cover publish (single `publishedAt` stamp, exactly-once `EXAMPLE_PUBLISHED` outbox event) and status-transition guards.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/example/services/index.ts` | SUT — every test calls `exampleService.*` |
| `src/modules/example/repository.ts` | Used directly to assert DB state (e.g. `count()`, `fieldOf` checks) |
| `src/modules/example/events.ts` | Imports `EXAMPLE_PUBLISHED` to assert outbox payload |
| `src/modules/example/audit.ts` | Imports `exampleAuditActions` to match audit log entries |
| `src/modules/example/rules.generated.ts` | Indirectly exercised — permission keys (`examples.*`, `display:Example`, `admin:Example`) gate every assertion |
| `src/kernel/events.ts` | `resetDomainEvents` in `afterEach`; `markDomainEventsWired` / `onDomainEvent` for publish-event assertions |
| `src/kernel/outbox.ts` | `outboxEventModel`, `settleOutboxNudges` to verify exactly-once publish announcement |
| `src/infrastructure/observability/audit.ts` | Mocked module; `observePort(auditPort.emitAuditEvent)` asserts calls |
| `src/infrastructure/observability/analytics/index.ts` | Mocked; `emitAnalyticsEvent` replaced with `jest.fn()` |
| `src/modules/example/tests/factories.ts` | `createExample`, `fieldOf` for seeding and DB inspection |
| `src/modules/users/tests/factories.ts` | `createUser` to provision real user rows |
| `src/types/index.ts` | `ExampleStatus` enum values in assertions |
| `tests/support/callers.ts` | `callerContextAs`, `testCallerContext` for role-based caller identity |
| `tests/support/environment.ts` | `withEnvironmentOverrides` to set `NODE_EXAMPLE_BODY_MAX_LENGTH` per-test |
| `tests/support/ids.ts` | `MISSING_ID` constant for "id nothing holds" cases |

## Notes

- **Ports are replaced, not spied.** The inline comment explains: `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import (`import * as auditPort from …`) exposes. The `jest.mock` factory in `tests/support/ports.ts` (`auditPortMock`) substitutes the whole module instead.
- **Real database, not an in-memory mock.** `setupTestDb()` runs once at module load; each test must clean up or rely on unique ids. There is no per-test transaction rollback visible here — state isolation is handled by the test runner.
- **`afterEach` resets domain events *and* clears all mocks.** Forgetting to call `resetDomainEvents` (e.g. after a refactor that removes the hook) will cause publish-event assertions to leak across tests.
- **Body ceiling is read from `process.env` at call time.** Tests use `withEnvironmentOverrides` to set `NODE_EXAMPLE_BODY_MAX_LENGTH`; the boundary is inclusive (a body *equal* to the ceiling is accepted).
- **Ownership denial returns `null`, not an error.** `getById` and `search` treat "no access" as an empty result, so callers cannot distinguish "doesn't exist" from "exists but is hidden." Tests assert `null` / `[]` rather than a 403.
