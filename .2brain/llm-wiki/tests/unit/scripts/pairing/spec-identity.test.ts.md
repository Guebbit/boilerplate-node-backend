---
source: tests/unit/scripts/pairing/spec-identity.test.ts
sha256: 8a08c7175a8b6ecede17a576ec77788f3288e4060af69da8ea7eb33cbbf3aa94
generated_at: 2026-10-15T13:29:30.772825+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/spec-identity.test.ts

## Purpose

Unit tests for the cross-repo contract check in `scripts/pairing/spec-identity.ts`. Validates the comparison logic against synthetic temp-directory roots (so it runs on any CI runner or standalone clone) and conditionally asserts that the two real sibling checkouts still agree. Fixes are derived from `SHARED_FILES` so new entries are automatically covered.

## Key elements

- **`makeRoot(files)`** — creates a throwaway temp directory populated with the given `{ path: contents }` map; all created roots are tracked and cleaned up in `afterAll`.
- **`sharedFiles(role, suffix?)`** — returns the full set of shared files for a given repo role, keyed by that role's path and filled with deterministic index-based contents. Indexed (not named) because the two repos may use different filenames for the same contract.
- **`OPENAPI`, `ASYNCAPI`, `CONVENIENCE`** — named constants for the three contract file paths as spelled in *this* (backend) repo. Declared as variables rather than inline literals to avoid a naming-convention lint rule that flags dot-containing string keys.
- **`CROSS_PATH`** — the first entry in `SHARED_FILES` whose `backend` and `frontend` paths differ (the async contract: `asyncapi.public.yaml` vs `asyncapi.yaml`). Used to exercise cross-path pair logic.
- **`sharedFilesWith(role, file, contents)`** / **`withoutFile(role, file)`** — one-file mutation helpers for fixtures.
- **`describe('SHARED_FILES')`** — structural invariants: `THIS_REPO === 'backend'`, exactly six backend paths, no duplicates, at least one cross-path pair, generated outputs excluded.
- **`describe('compareSharedFiles')`** — behavioral tests: identical match, cross-path match/drift, one-byte drift, file-not-in-list (convenience files like `spectral.yaml`), missing sibling checkout (`missing-there`), deleted file (`missing-here`), empty-both-sides no-throw.
- **`describe('hashFile')`** — hash correctness tests (section truncated in source).

## Relationships

- **`scripts/pairing/spec-identity.ts`** — the module under test. Imports `SHARED_FILES`, `THIS_REPO`, `siblingRole`, `compareSharedFiles`, `formatSharedFileProblems`, `hashFile`, `sharedFileProblems`, and the `RepoRole` type.
- **`scripts/pairing/paired-frontend-path.ts`** — imports `resolveFrontendPath`, likely used in the conditional "real pair" test to locate the sibling checkout.

## Notes

- The "real pair" test is **conditional**: it reports *skipped* (not passed) when the sibling checkout is absent, so a missing sibling is visibly absent rather than silently passing.
- Fixtures use index-based contents (`shared-${index} contents`) rather than path-based, because the two repos disagree on filenames; what must match is the bytes, not the path.
- `CONVENIENCE` (`shared/contracts/spectral.yaml`) is deliberately **not** in `SHARED_FILES`. The test asserts that a file absent from the list produces no problem even when the two copies differ — this is the membership rule: "produced here, copied there."
- Temp roots are cleaned up via `rmSync(…, { recursive: true, force: true })` in `afterAll`; if the process crashes mid-run the temp dirs leak (acceptable for CI).
- The file is the test counterpart to `spec-identity.ts`; a test that required the sibling repo to be present would be the one case that cannot run where the check matters most (fresh CI runners, standalone clones).
