---
source: src/modules/example/tests/integration/service.test.ts
sha256: 1c66be47d25a08f50349024b65df296f25d6a3d610251b0c9f95491f38234627
generated_at: 2026-11-08T05:55:21.936954+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/service.test.ts

## Purpose

Integration test suite that exercises `exampleService` against a real database (via `setupTestDb`). It verifies ownership scoping (own / any / nothing), the draft→published→archived lifecycle on write, one-time `publishedAt` stamping, exactly-once publish announcement through the outbox, and the environment-driven body-length ceiling.

## Key elements

- **`aCustomer` / `anAdmin` / `anotherAdmin`** – local helpers that create a real user row (via `createUser`) and return a paired caller context (`callerContextAs`).
- **`describe('create')`** – verifies trimming, default `draft` status, `ownerName` resolution, 401 for anonymous callers, 422 when body exceeds `NODE_EXAMPLE_BODY_MAX_LENGTH`, boundary-accept at the ceiling, and audit emission of `EXAMPLE_CREATED`.
- **`describe('who may read what')`** – owner reads own draft; stranger gets `null` (not a refusal); admin with `display:Example` reads anyone's; missing id yields `null`.
- **`describe('getById on a published example')`** – published examples are visible to strangers and anonymous callers; draft/archived remain invisible (indistinguishable from missing).
- **`describe('search')`** – scope-by-ownership, admin sees all with per-row `ownerName`, status filter, full-text search across title/body, empty result for a key-less caller.
- **`describe('updateById')`** – trim-on-write, `changedFields` audit metadata, 404 for non-owners (row untouched), admin override via `admin:Example`.
- **`jest.mock` blocks for audit & analytics ports** – ports are *replaced* with mocks (not spied) because CommonJS namespace getters are non-configurable.

## Relationships

- **`src/modules/example/services/index.ts`** – the unit under test (`exampleService`).
- **`src/modules/example/repository.ts`** – used directly to assert row counts and field values after service calls.
- **`src/modules/example/events.ts`** – supplies `EXAMPLE_PUBLISHED` for outbox/announcement assertions.
- **`src/modules/example/audit.ts`** – supplies `exampleAuditActions` constants checked against audit spy calls.
- **`src/modules/example/tests/factories.ts`** – `createExample` seeds rows; `fieldOf` reads a single column for post-condition checks.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates the identity rows the service authorises against.
- **`src/infrastructure/observability/audit.ts`** – mocked port; `observePort` inspects calls.
- **`src/infrastructure/observability/analytics/index.ts`** – mocked port (`emitAnalyticsEvent` stubbed).
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach`; `onDomainEvent` / `markDomainEventsWired` for publish-announcement assertions.
- **`src/kernel/outbox.ts`** – `outboxEventModel` and `settleOutboxNudges` verify the publish event is announced exactly once.
- **`src/types/index.ts`** – `ExampleStatus` enum used throughout.
- **`tests/support/callers.ts`** – `callerContextAs`, `testCallerContext` build authenticated/anonymous contexts.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` injects `NODE_EXAMPLE_BODY_MAX_LENGTH`.
- **`tests/support/ids.ts`** – `MISSING_ID` sentinel for "no such record" assertions.
- **`tests/support/ports.ts`** – `observePort` and `auditPortMock` enable port replacement.

## Notes

- Audit and analytics ports are **replaced** (`jest.mock` returning a fresh mock), not spied on, because `jest.spyOn` cannot redefine the non-configurable getter a CommonJS `import * as` exposes. See the comment above the mock blocks and `tests/support/ports.ts`.
- `afterEach` resets domain events **and** clears all mocks; tests must not rely on cross-test mock accumulation.
- The body-ceiling test reads `NODE_EXAMPLE_BODY_MAX_LENGTH` from the environment at call time via `withEnvironmentOverrides`; it is not a compile-time constant.
- Ownership tests rely on the service returning `null` (not a 404/403) for inaccessible-but-existing records; this is a deliberate API contract, not a bug.
