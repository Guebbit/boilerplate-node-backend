# tests/unit/scripts/spec-identity.test.ts

## Purpose

Unit tests for `scripts/spec-identity.ts`, the cross-repo contract checker that verifies shared spec/seed files between the backend (this repo) and its frontend sibling. Tests run against synthetic roots in a temp directory so they work on any CI runner without the sibling checked out, plus a conditional live test that only fires when the sibling is actually present.

## Key elements

- **`makeRoot` / `root`** — Builds throwaway repo roots under `tmpdir()`; `root` additionally tracks created paths for cleanup in `afterAll`.
- **`sharedFiles(role, suffix?)`** — Produces a `Record<string, string>` of file contents keyed by the pair's *index* (not by path), because the two repos disagree on some filenames. This is the canonical fixture builder.
- **`sharedFilesWith` / `withoutFile`** — One-entry replace / delete helpers built on top of `sharedFiles`; also serve as computed-key workarounds for the naming-convention lint rule.
- **`CROSS_PATH`** — Resolves the first `SHARED_FILES` entry whose `backend` and `frontend` paths differ (e.g. `asyncapi.public.yaml` vs `asyncapi.yaml`); used throughout cross-path tests.
- **`describe('SHARED_FILES')`** — Structural invariants: `THIS_REPO === 'backend'`, exactly three files, no duplicates, at least one cross-path pair exists, generated outputs are excluded.
- **`describe('compareSharedFiles')`** — Behavioural tests: identical → all match; cross-path match across different names; one-side edit → drift; one-byte difference → drift; a non-contract file (`spectral.yaml`) differing → no problem reported; empty sibling root → all `missing-there`; deleted local file → `missing-here`; both empty → no throw.
- **`describe('hashFile')`** — Verifies digest equality for identical contents and inequality for different contents (truncated in source).
- **Constants `OPENAPI`, `ASYNCAPI`, `CONVENIENCE`** — Named filenames used as fixture keys; `CONVENIENCE` (`spectral.yaml`) is deliberately *not* in `SHARED_FILES` and its test case enforces that boundary.

## Relationships

- **`scripts/spec-identity.ts`** — The module under test. This file imports `SHARED_FILES`, `THIS_REPO`, `siblingRole`, `compareSharedFiles`, `formatSharedFileProblems`, `hashFile`, `sharedFileProblems`, and the `RepoRole` type from it.
- **`scripts/paired-frontend-path.ts`** — Imports `resolveFrontendPath` (available for use in tests that need to resolve the sibling's frontend-relative path).
- **`tests/unit/infrastructure/adapters/filesystem.test.ts`** / **`tests/unit/infrastructure/adapters/image-store.test.ts`** — No direct import or runtime interaction visible in this file; they share the broader test-infrastructure layer but are not referenced here.

## Notes

- Fixtures derive their file list from `SHARED_FILES` at runtime, so adding a new entry to the contract list automatically covers it in every test without editing this file.
- The two roots in any comparison are intentionally built with *different* key sets (backend vs frontend spellings). Keying by index in `sharedFiles` is what makes them comparable.
- `spectral.yaml` is excluded from `SHARED_FILES` by design: it is a convenience config, not a produced-then-copied contract. The dedicated test asserting its absence is the guard against someone re-adding it.
- The conditional "real pair" test (referenced in the file's doc comment) reports as *skipped* rather than passing when the sibling is absent, so a silently-disappeared check is distinguishable from a green one.
- Object keys like `'openapi.yaml'` trigger a naming-convention lint rule; the `CONVENIENCE`/`OPENAPI`/`ASYNCAPI` constants and the `sharedFilesWith`/`withoutFile` helpers exist specifically to route around that.
