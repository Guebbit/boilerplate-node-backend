---
source: src/modules/users/tests/integration/service.test.ts
sha256: 1a89fd49033282017e53d8b244ff37d8dcffe50fa2176dbefd90a50e28015659
generated_at: 2026-10-29T06:23:03.504604+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for `userService` exercising search, getById, and the admin create/update/delete flows against an in-memory Mongo instance wired up by `setupTestDb`. It verifies business logic end-to-end (validation, filtering, role assignment, post-commit side effects) without a live database or real infrastructure adapters.

## Key elements

- **`expectCreated`** — helper that calls `userService.create`, asserts the envelope is `success: true`, and returns the unwrapped `UserDocument`. Used by every create-case that expects success.
- **`seedActiveAndDeleted`** — seeds three users whose `active` and `deletedAt` values deliberately disagree, backing the three `active`-filter assertions.
- **`describe('userService.search', …)`** — covers default pagination, text/email/username partial-match filters, `active: true/false` filtering (including the active-but-deleted edge), pagination math, and empty-collection meta.
- **`describe('userService.getById', …)`** — found (returns a hydrated Mongoose doc), not-found, and `undefined` id.
- **`describe('userService.create', …)`** — happy path, image hand-off failure after commit (spies `logger.error`), terms-not-recorded guarantee, role assignment via `accessService.rolesOf`, and a moderator creating a role-less customer.
- **`jest.mock` blocks** — swap the audit port, analytics port, and `imageStore.remove` with `jest.fn()`s so `observePort` can clear/retrieve them and so filesystem I/O is avoided.
- **`setupTestDb()`** — initialises the in-memory Mongo before any test runs.

## Relationships

- **`src/modules/users/services`** (`userService`) — the system under test; every `describe` block drives one or more of its methods.
- **`src/modules/users/tests/factories`** (`createUser`) — seeds documents directly into the in-memory Mongo for search/getById cases.
- **`src/modules/users/erasure-registry`** (`personalDataErasers`, `setPersonalDataErasers`) — imported for the delete/erasure flow tests.
- **`src/kernel/events`** (`markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents`) — used to capture and assert domain events emitted by create/update.
- **`src/kernel/outbox`** (`outboxEventModel`, `relayOutbox`, `settleOutboxNudges`) — used to verify outbox rows written during admin mutations.
- **`src/infrastructure/observability/audit`** — mocked; tests assert which `usersAuditActions` were emitted via `observePort`.
- **`src/infrastructure/observability/analytics`** — mocked (`emitAnalyticsEvent`); tests assert analytics events through `usersAnalyticsEvents`.
- **`src/infrastructure/adapters/logger`** (`logger`) — spied on in the image-handoff-failure test to confirm the expected error log.
- **`src/modules/access`** (`accessService`) — queried to verify role membership written by `create`/`update`.
- **`src/kernel/access/tenant`** (`DEPLOYMENT_TENANT_ID`) — passed to `accessService.rolesOf` calls.
- **`src/kernel/permissions`** (`systemCallerContext`) — imported for system-level caller context in delete/erasure tests.
- **`src/modules/access/tests/factories`** (`seedMembership`) — seeds access-module state needed by role-assertion tests.
- **`src/infrastructure/http/response`** (`ResponseSuccess`, `ResponseReject`) — type-level imports for envelope unwrapping in helpers.

## Notes

- **`jest.mock` for ports must yield a plain `jest.fn()`**, not the real (non-configurable) export. `observePort` (from `@tests/ports`) needs to `.mockClear()` and reassign the reference; a frozen real module binding would break it.
- **`imageStore` mock only stubs `remove`**; `applyImageWriteback` is kept real because tests rely on its pure mutation.
- **`active` ≠ deletion.** The `active` filter checks only the `active` column; a document with `deletedAt` set but `active: true` is *included* in `active: true` results. These are independent facts.
- **`search` returns lean objects** (plain JS via Mongoose `.lean()`), while `getById` returns hydrated documents. `presentAccount` must handle both shapes; one test explicitly verifies the lean path.
- **`callerContextAs('admin')` vs `testCallerContext`:** the admin context is used in create tests because a real route guard would have already enforced `create:User`; an anonymous caller would be rejected before reaching the service.
