---
source: src/modules/example/tests/integration/service.test.ts
source_sha256: 2d87523aeed17993e0647d2b4402acd32e4a8a5aef9e56529b0518b82c3cc856
context_sha256: bca220966a8a873ab1a8ffe7d0ff93edc73a40f542303a93b53ccad61da26584
generated_at: 2026-11-22T05:14:13.418486+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/integration/service.test.ts

## Purpose
Integration tests for `exampleService` running against a real test database. They cover ownership scoping in queries (own, any, or none), enforcement of the status lifecycle on write, one-time stamping of `publishedAt`, exactly-once announcement of a publish, and a body-length ceiling read from the environment. Only the first part of the file (create, read access, published reads, search, and the start of `updateById`) is described here.

## Key elements
- **Port mocks**: `@infrastructure/observability/audit` is replaced with `auditPortMock()` from `@tests/ports`. `emitAnalyticsEvent` in the analytics module is replaced with `jest.fn()`. The file notes that `jest.spyOn` can't redefine the non-configurable getter a CommonJS namespace import exposes.
- **`setupTestDb()`**: provisions the real database. An `afterEach` calls `resetDomainEvents()` and `jest.clearAllMocks()`.
- **Helpers**:
  - `aCustomer(username)` creates a user and returns it with an `editor` caller context.
  - `anAdmin()` creates a user and returns it with an `admin` caller context.
  - `anotherAdmin()` creates a user that has the `admin` role in the database, for the rank rule.
- **`describe('create')`**:
  - Trims the title and body, writes a draft owned by the caller, and returns `ownerName`.
  - Returns 401 with no identity.
  - Returns 422 over the `NODE_EXAMPLE_BODY_MAX_LENGTH` ceiling, with nothing written. A body exactly at the ceiling is accepted.
  - Emits an `EXAMPLE_CREATED` audit event targeting the new id.
- **`describe('who may read what')`**: `getById` returns an owner's own draft. For someone else's example, or a missing id, it returns `null` rather than a refusal. A caller holding `display:Example` can read anyone's.
- **`describe('getById on a published example')`**:
  - Published examples are readable by strangers and anonymous callers.
  - Draft and archived examples return `null` to strangers, the same as a missing id.
- **`describe('search')`**:
  - Non-privileged callers see only their own examples.
  - A `display:Example` holder sees everyone's, each with its own owner name.
  - Supports a status filter and a text search over title and body, with `sort`.
  - A caller with no examples key gets an empty list.
- **`describe('updateById')`**:
  - Audits `EXAMPLE_UPDATED` with `metadata.changedFields` listing field names only.
  - Edits the caller's own example and trims the text.
  - Returns 404 for someone else's example and leaves it unchanged.
  - Lets `admin:Example` edit anyone's.

## Relationships
- Exercises `exampleService` (`../../services`) and reads state via `exampleRepository` (`../../repository`).
- Asserts against `exampleAuditActions` (`../../audit`) and the mocked audit and analytics ports in `src/infrastructure/observability/`.
- Imports `EXAMPLE_PUBLISHED` (`../../events`), and `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` (`@kernel/events`). It also imports `outboxEventModel` and `settleOutboxNudges` (`@kernel/outbox`). These are used for the publish-announcement tests, which are outside the portion shown.
- Uses `createExample` and `fieldOf` from `../factories`, and `createUser` from `@modules/users/tests/factories`.
- Uses shared test support: `callerContextAs`, `testCallerContext` (`tests/support/callers.ts`), `MISSING_ID` (`tests/support/ids.ts`), `withEnvironmentOverrides` (`tests/support/environment.ts`), plus `observePort`, `asSuccess`, and `asReject`.
- `ExampleStatus` comes from `@types`.

## Notes
- A caller who lacks access to an example gets `null` on read and 404 on update, so the service doesn't reveal whether the example exists.
- The body ceiling is overridden per test with `withEnvironmentOverrides`, which takes an async callback.
