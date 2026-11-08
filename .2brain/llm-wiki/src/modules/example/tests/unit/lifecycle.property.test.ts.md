---
source: src/modules/example/tests/unit/lifecycle.property.test.ts
sha256: c0e7e76937eef682b0b21ee7755b26894d4bc47a20e9dcd310b21ef1b3947617
generated_at: 2026-11-08T05:56:09.446081+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/lifecycle.property.test.ts

## Purpose

Property-based tests (via `fast-check`) that pin the public invariants of the example lifecycle: only legal events are ever offered, every offered event actually changes status, and permission gating behaves correctly. The event table itself is private to the domain module; these tests exercise the contract a client sees through `canApply` and `exampleActionsFor`.

## Key elements

- **`RUN`** — Shared `fast-check` runner config: fixed seed `20_261_022`, run count from `PROPERTY_RUNS`, `endOnFailure: true`. One place to change seed or iteration count.
- **`EVENTS`** — `readonly` list of all `ExampleEvent` values (`'publish' | 'archive' | 'unarchive'`) used to iterate in assertions.
- **`anyStatus()`** — Arbitrary that generates every `ExampleStatus` value.
- **`anyPermits()`** — Arbitrary that generates a `{ update: boolean; delete: boolean }` record.
- **Five `it()` blocks** (each an `fc.assert` property):
  1. Opened events are always legal per `canApply`.
  2. Opened events never leave the status unchanged (`statusAfter` ≠ input status).
  3. With `update: false`, no event is offered regardless of `delete`.
  4. With `update: true`, the offered set matches `canApply` exactly for each event.
  5. The `update`/`delete` keys in the result echo the input unchanged.

## Relationships

- **`src/modules/example/domain/lifecycle.ts`** — The implementation under test; `canApply`, `exampleActionsFor`, and `statusAfter` originate here.
- **`src/modules/example/domain/index.ts`** — Barrel re-export; the test imports the three functions and `ExampleEvent` type from `../../domain`.
- **`src/types/index.ts`** — Provides the `ExampleStatus` enum used to enumerate statuses.
- **`tests/support/knobs.ts`** — Supplies `PROPERTY_RUNS`, the shared iteration-count knob for all property tests in the repo.

## Notes

- The seed is intentionally fixed so a counterexample reproduces deterministically and can be written back as an ordinary `it()` (per the module doc comment).
- `endOnFailure: true` means the first failing shrink stops the property; subsequent properties still run.
- The `delete` permission appears in the permits object but never influences which lifecycle events are offered — only `update` gates them. The tests confirm this implicitly (test 3 passes any `delete` value; test 4 varies `delete` but the assertion depends only on `canApply`).
- Import path is relative (`../../domain`), not a package alias, which is the convention for in-module unit tests.
