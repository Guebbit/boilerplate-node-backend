---
source: tests/unit/domain-primitives/lifecycle.test.ts
sha256: 2a14a54156f58a1e06e0845461b055df21f045426d0b1f83d82b07f314501cd1
generated_at: 2026-11-08T10:03:56.250563+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/lifecycle.test.ts

## Purpose

Unit tests for the `defineLifecycle` primitive. It verifies that a lifecycle built from a status set and an event table correctly exposes transitions, narrows by actor, and rejects malformed tables—all tested against a small, self-contained status set (`draft → live → gone`) so the primitive is exercised independently of any application module.

## Key elements

- **`STATUSES` / `Status`** – A three-value const tuple (`'draft' | 'live' | 'gone'`) that acts as the closed status universe for every test case.
- **`table`** – The event table passed to `defineLifecycle`: three events (`publish`, `retire`, `revive`) with explicit `from`, `to`, and optional `actors` fields.
- **`lifecycle`** – The concrete `defineLifecycle<Status, …, 'staff' | 'system'>` instance under test; all positive assertions call its methods (`initial`, `fromOf`, `toOf`, `allows`, `eventsFrom`, `reachableFrom`, `canTransition`).
- **`build`** – A thunk factory that constructs a `defineLifecycle<string, string>` from loose string data; used exclusively in the validation test to trigger expected throws.
- **`describe('defineLifecycle')`** block – Five `it` cases covering: table fidelity, ordered event/reachability listing, actor narrowing, no self-transitions, and table validation errors.

## Relationships

- **`src/domain-primitives/lifecycle.ts`** – Provides the single production symbol `defineLifecycle` that this file imports and exercises. The test file has no other imports; all assertions target the shape and behavior of that one function.

## Notes

- The `actors` field is **optional** on an event entry. When absent (e.g. `revive`), any actor is permitted; when present, only listed actors pass `allows`.
- `canTransition` is the only method that returns `false` for a from→to pair where from === to; the other methods (`allows`, `eventsFrom`, etc.) do not special-case self-loops because the table itself would not list them.
- The validation test uses `build` (which widens generics to `string`) so that TypeScript cannot catch the bad values at compile time; the errors surface at runtime via `toThrow`.
- Table order matters: `eventsFrom` and `reachableFrom` are asserted to return results in insertion order of the `events` record, not alphabetically.
