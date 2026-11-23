---
source: src/modules/example/tests/unit/lifecycle.property.test.ts
source_sha256: b299acb07a1f87862d60d2414893178fc04461fb535cf91dec2fcbad0ef4b06e
context_sha256: 9c5eebffc9ad5289333f8de79d908bb5eba5bcb44afb14e9adc67ea44ff2beba
generated_at: 2026-11-22T05:15:02.734241+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/unit/lifecycle.property.test.ts

## Purpose
Property-based tests (fast-check) for the example module's lifecycle in `src/modules/example/domain/lifecycle.ts`. The event table is private, so the tests exercise only the public surface, `canApply`, `exampleActionsFor` and `statusAfter`, and pin the invariants a client relies on. Runs are seeded, so a counterexample found can be written back as an ordinary `it()`.

## Key elements
- `RUN`: shared fast-check options: fixed seed `20_261_022`, `numRuns: PROPERTY_RUNS`, `endOnFailure: true`.
- `EVENTS`: the three lifecycle events: `publish`, `archive`, `unarchive`.
- `anyStatus()`: arbitrary drawn from every value of `ExampleStatus`.
- `anyPermits()`: arbitrary `{ update, delete }` boolean record, standing for a caller's keys.
- Properties, in a single `describe` block:
  - Every event that `exampleActionsFor` opens is one `canApply` allows from that status.
  - No opened event has a `statusAfter` equal to the current status.
  - With `update: false`, no event is offered, whatever `delete` is.
  - With `update: true`, each event is offered exactly when `canApply(event, status)` is true.
  - `actions.update` and `actions.delete` echo the input permits unchanged.

## Relationships
- `src/modules/example/domain/index.ts`: source of `canApply`, `exampleActionsFor`, `statusAfter` and the `ExampleEvent` type.
- `src/modules/example/domain/lifecycle.ts`: the implementation under test, reached through the domain barrel rather than imported directly.
- `src/types/index.ts`: supplies the `ExampleStatus` enum used to generate statuses (imported as `@types`).
- `tests/support/knobs.ts`: supplies `PROPERTY_RUNS` (imported as `@tests/knobs`); the file's comment names `TEST_PROPERTY_RUNS` as the setting that controls the run count.

## Notes
- To change the seed, edit `RUN`; the run count is controlled separately through the `TEST_PROPERTY_RUNS` setting.
- `describe` and `it` are used without imports, so they are presumably test-runner globals.
