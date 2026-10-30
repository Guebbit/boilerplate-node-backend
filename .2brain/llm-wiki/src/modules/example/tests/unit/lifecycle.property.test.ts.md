---
source: src/modules/example/tests/unit/lifecycle.property.test.ts
sha256: c0e7e76937eef682b0b21ee7755b26894d4bc47a20e9dcd310b21ef1b3947617
generated_at: 2026-10-29T03:58:23.388378+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/lifecycle.property.test.ts

## Purpose

Property-based tests (fast-check) for the public surface of the `lifecycle` domain module. It pins the invariants a client relies on—event legality, state transition, permission gating, and key pass-through—without enumerating every (status, permits) pair by hand. The file exists so that a future change to `canApply` or `exampleActionsFor` is caught by random exploration rather than only by hand-written cases.

## Key elements

- **`RUN`** — shared fast-check config: fixed seed `20_261_022`, `numRuns` sourced from `PROPERTY_RUNS`, and `endOnFailure: true` (stop at first counterexample).
- **`EVENTS`** — readonly tuple `['publish', 'archive', 'unarchive']`; the complete set of `ExampleEvent` values the tests iterate over.
- **`anyStatus()`** — arbitrary that yields a random `ExampleStatus` enum value.
- **`anyPermits()`** — arbitrary that yields a `{ update: boolean, delete: boolean }` record.
- **Five property tests** inside one `describe`:
  - *opens only events the lifecycle has* — `actions[event] === true` ⇒ `canApply(event, status) === true`.
  - *never opens a no-op* — `actions[event] === true` ⇒ `statusAfter(event) !== status`.
  - *no edit permission → no events* — `update: false` ⇒ every action flag is `false`.
  - *edit permission → full parity* — `update: true` ⇒ each `actions[event]` matches `canApply(event, status)`.
  - *echoes input keys* — `actions.update` / `actions.delete` equal the caller-supplied booleans.

## Relationships

- **`src/modules/example/domain/index.ts`** — the barrel import (`../../domain`) that re-exports `canApply`, `exampleActionsFor`, `statusAfter`, and the `ExampleEvent` type under test.
- **`src/modules/example/domain/lifecycle.ts`** — the concrete implementation those exports resolve to; the test never touches its private event table.
- **`src/types/index.ts`** — supplies the `ExampleStatus` enum used by the `anyStatus()` arbitrary.
- **`tests/support/knobs.ts`** — provides the shared `PROPERTY_RUNS` constant so the run count stays in one place across all property tests.

## Notes

- **Reproducible counterexamples.** Because the seed is hard-coded, a failing run can be shrunk to a minimal case and pasted back as a plain `it()` assertion (noted in the file's module doc).
- **`endOnFailure: true`** means the suite stops at the first violation; it will not collect multiple failures in a single invocation.
- **Run count is external.** Changing `PROPERTY_RUNS` in `tests/support/knobs.ts` affects this file (and any other property test that imports it) without editing the test itself.
- The tests deliberately exercise only the *public* API (`canApply`, `exampleActionsFor`, `statusAfter`); the internal transition table in `lifecycle.ts` is treated as an implementation detail.
