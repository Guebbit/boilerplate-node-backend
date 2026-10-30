---
source: src/modules/users/tests/unit/public-events.test.ts
sha256: e9b8be5c3d59426ab508f2118ff423aa169a22a0eabd6b58f6d41c7d9f93ca8d
generated_at: 2026-10-29T06:23:55.517788+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/public-events.test.ts

## Purpose

Verifies the privacy contract of the users module's public-event projections: that webhook subscribers receive only identifiers (and field names), never sensitive values. Each test pulls a projection from the module's `publicEvents` registry, feeds it a representative domain-event payload, and asserts the resulting `{ eventType, data }` shape.

## Key elements

- **`describe('the users module's public events')`** — top-level suite; no setup/teardown.
- **Test: "tells subscribers an account was erased, with its id alone"** — projects a `USER_ERASED` payload (`{ userId, email }`) and asserts the output is `{ eventType: 'user.erased', data: { userId: 'u1' } }`, i.e. `email` is stripped.
- **Test: "tells subscribers which fields were rectified, never their values"** — projects a `USER_PROFILE_CHANGED` payload (`{ userId, changed: ['email'] }`) and asserts the output is `{ eventType: 'user.updated', data: { userId: 'u1', changed: ['email'] } }`, confirming only field *names* leak, not their new values.

## Relationships

- **`src/modules/users/module.ts`** — the test reads `usersModule.publicEvents`, a map keyed by domain-event name. Each entry exposes a `toPublicEvent(domainEvent)` method that the tests exercise.
- **`src/modules/users/events.ts`** — provides the `USER_ERASED` and `USER_PROFILE_CHANGED` constants used as keys into that map. The tests do not import any payload types from this file; they construct inline literals.

## Notes

- **`as never` cast** — the registry slot is typed to accept `never` so a single generic registry can hold every module's projections. Tests cast the payload to `never` to satisfy the signature; this is intentional, not a type error.
- **Public event names ≠ domain event names** — `USER_ERASED` maps to the wire string `'user.erased'`, while `USER_PROFILE_CHANGED` maps to `'user.updated'`. If you add a new projection, match this naming pattern in the assertion.
- **No mocking** — the tests call the real `toPublicEvent` implementations; they are pure projection functions with no side effects.
