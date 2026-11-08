---
source: src/modules/account/tests/unit/revocation-table.test.ts
sha256: 88aafadccca87b58fa68b3a6cda3e7c1b563ec324f9bf196bc7eddb59ee18114
generated_at: 2026-11-08T04:49:01.785765+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/revocation-table.test.ts

## Purpose

Tests cross-field invariants of the `REVOCATION` table that no single-cause test would surface. Each assertion checks a structural relationship *between* fields (e.g. `callerKeeps` ⇒ `announce === false`) or pins down which subset of causes participates in a given behaviour (announce, pending purge, jwt-only modes).

## Key elements

- **`CAUSES`** — derived at module level from `Object.keys(REVOCATION)`; used to iterate every registered cause in the `it.each` blocks.
- **`'announces exactly the causes…'`** — asserts the exact set of causes for which `announces(cause)` is truthy.
- **`'purges the pending one-time links…'`** — asserts the exact set of causes whose `REVOCATION[cause].pending` is truthy.
- **`'a caller that keeps its session rode the epoch in its own write'`** (`it.each`) — invariant: `callerKeeps` ⇒ `epoch === 'with-write'`.
- **`'a caller that keeps its session is never told it was compromised'`** (`it.each`) — invariant: `callerKeeps` ⇒ `announce === false`.
- **`'limits one cause to a single session mode…'`** — asserts that `refresh-reuse` is the *only* cause with `modes === 'jwt'`.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — sole import target. The test reads `REVOCATION` (the table object), `announces` (predicate), and the `RevocationCause` type from this module. No other modules are touched.

## Notes

- The descriptive tests hard-code the expected cause arrays. They are effectively *snapshots*: if a new cause is added to the domain table but a corresponding invariant is not satisfied, the test fails and the array must be updated deliberately.
- The two `it.each` blocks only fire their expectation when `callerKeeps` is truthy; causes without that flag silently pass. A future cause that sets `callerKeeps` will immediately be checked against both invariants.
- `toSorted()` is used throughout (non-mutating); do not replace with `sort()` without preserving that guarantee.
