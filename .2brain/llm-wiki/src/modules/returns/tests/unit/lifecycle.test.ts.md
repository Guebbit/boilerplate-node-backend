---
source: src/modules/returns/tests/unit/lifecycle.test.ts
sha256: 408f2a7430a996b6b1e4219e51f66e6b97edbe06a6962f4ef9249a7172f8b90d
generated_at: 2026-11-14T21:48:36.893813+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the `returnLifecycle` state machine. Verifies that every legal status-to-event transition is exposed, that terminal statuses admit no outgoing events, that each event maps to the correct target status, that the initial status is `requested`, and that `defineLifecycle` rejects a status table missing a status referenced by the event contract.

## Key elements

- **`describe('returnLifecycle')`** — single test suite; no helper functions or additional exports.
- **`returnLifecycle.eventsFrom(status)`** — asserted for each non-terminal status (`requested`, `approved`, `received`) to confirm the exact set of outgoing events, and for each terminal status (`declined`, `canceled`, `closed`) to confirm an empty array.
- **`returnLifecycle.toOf(event)`** — asserted for every event (`approve`, `decline`, `receive`, `cancel`, `close`) to confirm the destination `ReturnStatus`.
- **`returnLifecycle.initial`** — asserted to equal `ReturnStatus.requested`.
- **`defineLifecycle(...)` validation test** — builds a status list with `closed` removed, passes it alongside the full `RETURN_EVENTS` table, and expects a throw matching `/unknown "closed"/`.

## Relationships

- **`src/modules/returns/domain/index.ts`** — source of the system under test (`returnLifecycle`) and the event table (`RETURN_EVENTS`) imported at the top of the file.
- **`src/modules/returns/domain/lifecycle.ts`** — where `returnLifecycle` is actually defined; the test reaches it through the domain barrel export.
- **`src/types/index.ts`** — provides the `ReturnStatus` enum used to name statuses in every assertion.
- **`src/domain-primitives/lifecycle.ts`** — provides `defineLifecycle`, the state-machine factory whose contract-validation path is exercised by the final test.

## Notes

- The last test does **not** test `returnLifecycle` directly; it tests the `defineLifecycle` factory's rejection behavior. A regression in that factory's validation would surface here rather than in a domain-logic test.
- Terminal-status coverage is written as a single loop over `[declined, canceled, closed]` rather than three separate `it` blocks, so a failure message will name all three in one line.
- The `RETURN_EVENTS` import is used **only** in the validation test (to reconstruct the contract); the transition tests read the already-built `returnLifecycle` object.
