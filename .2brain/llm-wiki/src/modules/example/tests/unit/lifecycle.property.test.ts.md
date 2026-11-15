---
source: src/modules/example/tests/unit/lifecycle.property.test.ts
sha256: b299acb07a1f87862d60d2414893178fc04461fb535cf91dec2fcbad0ef4b06e
generated_at: 2026-11-14T20:01:50.297354+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/lifecycle.property.test.ts

## Purpose

Property-based tests (via `fast-check`) for the lifecycle domain module. Instead of hand-picking fixture cases, the suite generates random combinations of status and permission keys and asserts the invariants a client relies on: opened events are always legal from the current status, no event is a no-op, and a caller without edit permission gets no actions. The file is `@module` — it exports nothing.

## Key elements

- **`RUN`** — Shared fast-check config: fixed seed `20_261_022`, `numRuns` taken from `PROPERTY_RUNS`, and `endOnFailure: true` (first counterexample stops the property).
- **`EVENTS`** — `readonly ExampleEvent[]` listing every lifecycle event (`publish`, `archive`, `unarchive`); used to filter which events `exampleActionsFor` "opens."
- **`anyStatus()`** — Generator that picks a random `ExampleStatus` via `fc.constantFrom`.
- **`anyPermits()`** — Generator producing a `{ update: boolean; delete: boolean }` record.
- **`describe("the lifecycle, over every status and every set of keys")`** — Five property tests:
  1. Opened events are always legal (`canApply` is true) from the current status.
  2. No opened event maps back to the same status via `statusAfter` (no no-ops).
  3. With `update: false`, every action flag is `false` regardless of `delete`.
  4. With `update: true`, every action flag exactly matches `canApply`.
  5. `actions.update` and `actions.delete` echo the input permits unchanged.

## Relationships

- **`src/modules/example/domain/index.ts`** — Re-exports the public API under test: `canApply`, `exampleActionsFor`, `statusAfter`, and the `ExampleEvent` type.
- **`src/modules/example/domain/lifecycle.ts`** — The implementation the properties constrain (the "event table" mentioned in the file's doc comment).
- **`src/types/index.ts`** — Source of `ExampleStatus`, the enum the generator enumerates.
- **`tests/support/knobs.ts`** — Provides `PROPERTY_RUNS`, the single knob controlling how many random cases each property executes.

## Notes

- The internal event table in the domain is private; these tests deliberately only exercise the public surface (`canApply`, `exampleActionsFor`, `statusAfter`).
- Seeding is intentional: a failing run is reproducible. The doc comment notes that fast-check will "write back" a counterexample as an ordinary `it()` assertion on the next run.
- `endOnFailure: true` means the suite stops at the first shrinking counterexample rather than collecting many failures — keep this in mind when reading CI output.
