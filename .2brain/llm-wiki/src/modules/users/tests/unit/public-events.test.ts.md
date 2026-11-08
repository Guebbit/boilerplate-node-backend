---
source: src/modules/users/tests/unit/public-events.test.ts
sha256: e9b8be5c3d59426ab508f2118ff423aa169a22a0eabd6b58f6d41c7d9f93ca8d
generated_at: 2026-11-08T08:58:42.831017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/public-events.test.ts

## Purpose

Unit tests that verify the users module's public-event projections: given an internal domain event, the `publicEvents` registry maps it to the correct outbound shape (event name + payload) and—critically—strips all sensitive values, exposing only identifiers and field names.

## Key elements

- **`describe('the users module's public events')`** — single top-level block containing two assertions.
- **Test 1 (`USER_ERASED`)** — calls `usersModule.publicEvents[USER_ERASED].toPublicEvent(...)` and expects `{ eventType: 'user.erased', data: { userId } }`. Confirms the email (or any other value) is dropped.
- **Test 2 (`USER_PROFILE_CHANGED`)** — calls the same pattern for `USER_PROFILE_CHANGED` and expects `{ eventType: 'user.updated', data: { userId, changed: ['email'] } }`. Confirms the *list of changed field names* is forwarded but not their values.

## Relationships

- **`src/modules/users/events.ts`** — supplies the `USER_ERASED` and `USER_PROFILE_CHANGED` string constants used as registry keys and (implicitly) as the input event discriminators.
- **`src/modules/users/module.ts`** — the SUT. The tests read `usersModule.publicEvents[<event>].toPublicEvent(...)`, exercising the projection function defined there.

## Notes

- Every call to `toPublicEvent` casts its argument `as never`. This is intentional: the registry's slot type is `never` so a single generic map can hold projections for all modules. Tests mirror that contract; don't "fix" the cast.
- The tests assert **exact** payloads (`toEqual`), not subsets—adding any extra field to a projection will break them, which is the point (privacy boundary).
