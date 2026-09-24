---
source: tests/unit/scripts/pairing/spec-identity.test.ts
sha256: 8582dcd94b59d92cb15d72853bda6e0563111e6721c3aafea8acaeba453f30cd
generated_at: 2026-09-23T20:31:54.897838+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/spec-identity.test.ts

## Purpose

Unit tests for the cross-repo contract check in `scripts/pairing/spec-identity.ts`. Validates that the shared-file comparison logic correctly detects matches, drifts, and missing files between a backend and a frontend checkout, using synthetic temp-directory roots so the tests run on any CI runner without a sibling repo. Also asserts the structural invariants of the `SHARED_FILES` list itself.

## Key elements

- **`makeRoot`** — creates a throwaway temp directory with the given files; tracked for cleanup in `afterAll`.
- **`sharedFiles(role, suffix?)`** — builds a file→contents map from `SHARED_FILES` keyed by the pair's _index_ (not by path), because the two repos may name the same file differently.
- **`sharedFilesWith` / `withoutFile`** — fixture helpers that replace or remove a single entry; exist to sidestep a naming-convention lint rule that fires on string-literal object keys like `'openapi.yaml'`.
- **`OPENAPI`, `ASYNCAPI`, `CONVENIENCE`** — named constants for the three contract-relevant filenames in THIS repo's spelling; `CONVENANCE` is the deliberately-excluded file (Spectral ruleset) used in the negative-case test.
- **`CROSS_PATH`** — the first `SHARED_FILES` entry whose backend and frontend paths differ (e.g. `asyncapi.public.yaml` vs `asyncapi.yaml`); the test that guards the pair structure.
- **`describe('SHARED_FILES')`** — asserts repo identity, file count, exclusion of generated outputs, cross-path pair existence, and no duplicates.
- **`describe('compareSharedFiles')`** — the main logic suite: identical match, cross-path match, one-sided drift, one-byte drift, irrelevant identical file, missing sibling (all `missing-there`), deleted local file (`missing-here`), and empty-vs-empty.
- **`describe('hashFile')`** — verifies digest equality for identical contents and inequality for different contents.

## Relationships

- **`scripts/pairing/spec-identity.ts`** — the module under test; this file imports `SHARED_FILES`, `THIS_REPO`, `siblingRole`, `compareSharedFiles`, `formatSharedFileProblems`, `hashFile`, `sharedFileProblems`, and the `RepoRole` type from it.
- **`scripts/pairing/paired-frontend-path.ts`** — imports `resolveFrontendPath`, used to locate the sibling repo root for the conditional "real pair" test (not shown in the truncated content but referenced in the import list).

## Notes

- Fixtures are indexed by pair position, not by filename, because the two repos disagree on names for at least one file (the AsyncAPI spec). Keying by path would make every pair read as forked.
- The conditional sibling test (present when the sibling checkout is detected) is the only assertion that catches a hand-introduced fork; it reports _skipped_ (not passing) when the sibling is absent.
- `CONVENIENCE` (`shared/contracts/spectral.yaml`) is included in fixtures but deliberately **not** in `SHARED_FILES`; the test that includes it verifies the check stays silent about files both repos merely keep identical.
- A file added to `SHARED_FILES` is automatically covered by every `compareSharedFiles` test without touching this file — the test suite is list-driven, not hardcoded.
