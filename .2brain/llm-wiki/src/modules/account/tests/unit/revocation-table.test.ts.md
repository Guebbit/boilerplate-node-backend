---
source: src/modules/account/tests/unit/revocation-table.test.ts
sha256: 88aafadccca87b58fa68b3a6cda3e7c1b563ec324f9bf196bc7eddb59ee18114
generated_at: 2026-10-29T03:05:20.213758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/revocation-table.test.ts

## Purpose

Verifies cross-cutting invariants of the `REVOCATION` table — constraints that hold *across* all causes simultaneously and would not be caught by a test targeting a single cause in isolation (e.g. "every cause that keeps the caller's session must announce `false`").

## Key elements

- **`CAUSES`** — derived at module load as `Object.keys(REVOCATION)` cast to `RevocationCause[]`; drives every assertion in the file.
- **`announces`** (imported predicate) — used to filter causes the subscriber must treat as a compromise; the test pins the resulting sorted set to exactly `['email-change-undo', 'logout-all', 'password-reset']`.
- **Pending-purge test** — asserts the sorted set of causes whose entry has a `pending` field is exactly `['deactivation', 'deletion-scheduled', 'email-change-undo', 'password-change', 'password-reset']`.
- **`it.each` / `callerKeeps` invariants** (two parameterized tests) — for every cause where `callerKeeps` is truthy, asserts `epoch === 'with-write'` and `announce === false`.
- **Session-mode exclusivity test** — asserts only `'refresh-reuse'` maps to `modes === 'jwt'`.

## Relationships

- **`src/modules/account/domain/revocation.ts`** — sole dependency. Provides the `REVOCATION` table (the object under test), the `announces` predicate, and the `RevocationCause` type. The test file imports nothing else from the domain.

## Notes

- `announces` is imported as a *function* (not a field), so it is a domain-level predicate rather than a raw property read. The test relies on it being a pure `(cause) => boolean` filter.
- The two `it.each` tests are intentionally silent when `callerKeeps` is falsy (`if` guard), meaning they only constrain a subset of causes; a new cause with `callerKeeps` set will be checked automatically on the next run.
- All set comparisons use `.toSorted()` to make ordering irrelevant, so adding a new cause without updating the expected array will fail the test.
