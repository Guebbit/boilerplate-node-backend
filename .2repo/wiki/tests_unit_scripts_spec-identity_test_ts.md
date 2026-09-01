# tests/unit/scripts/spec-identity.test.ts

## Purpose
Unit tests for the cross-repo contract check in `scripts/spec-identity.ts`. Verifies that the two shared spec files (OpenAPI, AsyncAPI) remain byte-identical between the backend and frontend checkouts, covering both the comparison logic (driven against synthetic temp-dir fixtures) and the live pair (conditional on the sibling checkout actually being present).

## Key elements
- **`makeRoot` / `root`** — builds a throwaway temp directory with the given file map; `root` additionally tracks the path for `afterAll` cleanup.
- **`sharedFiles(role, suffix?)`** — returns a path→contents map for every entry in `SHARED_FILES`, keyed by the *pair's index* (not the filename) so the two repos' different names still produce matching contents.
- **`sharedFilesWith` / `withoutFile`** — fixture variants that replace or delete one entry; use computed keys to sidestep the naming-convention lint rule that trips on dotted string literals as object keys.
- **`CROSS_PATH`** — the first pair in `SHARED_FILES` whose `backend` and `frontend` filenames differ (e.g. `asyncapi.public.yaml` vs `asyncapi.yaml`); the test that the pair structure is non-trivial.
- **`describe('SHARED_FILES')`** — validates list invariants: correct `THIS_REPO` role, exactly two backend paths, no generated outputs, at least one cross-path pair, no duplicates.
- **`describe('compareSharedFiles')`** — exercises match, drift (one-byte and one-side-only), missing-sibling, missing-here, and empty-both-roots cases; asserts `sharedFileProblems` output.
- **`describe('hashFile')`** — checks digest equality for identical bytes and inequality for differing bytes.
- **Constants** — `OPENAPI`, `ASYNCAPI`, `CONVENANCE` (`spectral.yaml`), `HERE`/`THERE` role aliases.

## Relationships
- **`scripts/spec-identity.ts`** — the module under test. Imports `SHARED_FILES`, `THIS_REPO`, `siblingRole`, `compareSharedFiles`, `formatSharedFileProblems`, `hashFile`, `sharedFileProblems`, and the `RepoRole` type.
- **`scripts/paired-frontend-path.ts`** — imports `resolveFrontendPath` (used in the truncated portion for locating the sibling checkout in the live-pair test).

## Notes
- Fixtures are generated from `SHARED_FILES` itself, not a hardcoded list. Adding a file to the contract automatically makes it appear in every test case; forgetting to add a test is structurally impossible.
- The live-pair test (real sibling checkout) **skips** rather than passes when the sibling is absent. A silently absent check is considered worse than a visibly skipped one.
- `spectral.yaml` is deliberately *not* in `SHARED_FILES`; the test suite asserts this exclusion and documents the rationale (convenience file, not a contract; one repo's ruleset may be stricter without breaking the other).
- The `sharedFiles` helper keys contents by array index, not by filename, specifically because the two repos use different paths for the same logical file. Keying by path would make every pair look forked.
