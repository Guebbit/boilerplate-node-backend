---
source: src/modules/users/tests/unit/public-events.test.ts
sha256: e99967e32fe65a22c8aff0d25da8b8d6ce9a95a94ff859d904fa270ec024cfbe
generated_at: 2026-11-14T22:40:06.413551+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/public-events.test.ts

## Purpose

Unit tests for the users module's public-event projections — the `toPublicEvent` transforms exposed via the module manifest. Verifies that webhook subscribers receive only event type names and IDs, never sensitive field values.

## Key elements

- **`describe('the users module's public events')`** — top-level suite; no setup/teardown, each test is self-contained.
- **Test 1: `USER_ERASED` projection** — asserts the projection emits `{ eventType: 'user.erased', data: { userId } }` and omits the `email` field present on the domain event.
- **Test 2: `USER_PROFILE_CHANGED` projection** — asserts the projection emits `{ eventType: 'user.updated', data: { userId, changed: ['email'] } }`, confirming field *names* are surfaced but their *values* are not.

## Relationships

- **`src/modules/users/events.ts`** — source of the `USER_ERASED` and `USER_PROFILE_CHANGED` event-type constants used to index into the public-events registry.
- **`src/modules/users/module.ts`** — the test imports the default export (`usersModule`) and reads its `publicEvents` registry to obtain the projection target for each event type.
- **`tests/support/stub.ts`** — provides `asStub`, a type-level helper that casts a plain object to satisfy the `never`-typed slot on the generic `publicEvents` registry.

## Notes

- The registry slot is typed `never` so a single manifest shape can hold every module's projections; tests must use `asStub<never>(…)` to bypass the type check. This is intentional, not a bug.
- The invariant under test is a **privacy boundary**: projections are IDs-only. If a future projection accidentally leaks a value, these tests are the first line of defence.
