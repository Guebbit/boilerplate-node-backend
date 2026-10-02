---
source: scripts/pairing/spec-identity.ts
sha256: 11097f3136cf8442b44e65a6782bd9942dedfba06cbf1125568119f4c0f9c33a
generated_at: 2026-10-01T12:37:39.603033+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/spec-identity.ts

## Purpose

Defines and executes the cross-repo contract identity check: a byte-for-byte SHA-256 comparison of a small, curated set of spec files that must exist in both the backend and the paired frontend checkout. It exists because a one-line edit in either repo silently forks what both sides believe they share, and neither CI pipeline catches it on its own.

## Key elements

- **`THIS_REPO`** — constant set to `'backend'`; the single value that differs from the frontend's copy of this file.
- **`SHARED_FILES`** — the authoritative list of `SharedFile` pairs (`openapi.yaml`, `asyncapi.public.yaml` → `asyncapi.yaml`, `shared/authorization-keys.yaml` → `contracts/authorization-keys.yaml`). Membership rule: the file must be *produced* in the backend and *copied* to the frontend; convenience-identical files and regenerable outputs are excluded.
- **`siblingRole(role)`** — flips `'backend'` ↔ `'frontend'`.
- **`hashFile(filePath)`** — returns the SHA-256 hex digest of a file's contents.
- **`compareSharedFiles(siblingRoot, here?, role?)`** — walks `SHARED_FILES`, returns a `SpecComparison[]` with status `'match' | 'drift' | 'missing-here' | 'missing-there'`. Never throws on missing files.
- **`sharedFileProblems(comparisons)`** — filters to entries whose status is not `'match'`.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a human-readable diagnostic (with repair steps) or returns `''` when everything matches.

## Relationships

- **`scripts/pairing/check-spec-identity.ts`** — the CLI entry point that calls `compareSharedFiles` and `formatSharedFileProblems` to produce pass/fail output for CI or local runs.
- **`scripts/pairing/sync-to-frontend.ts`** — the `sync:frontend` script referenced in the diagnostic message; it is the remediation step that re-copies the backend-produced specs into the frontend checkout.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — unit tests for the comparison, filtering, and formatting functions exported here.
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the `asyncapi.public.yaml` ↔ `asyncapi.yaml` pair in the context of the bundle-generation pipeline that produces it.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — verifies that the check participates correctly in the CI wave ordering (i.e., runs after the sibling checkout is available).

## Notes

- The comparison is deliberately **identity**, not semantic equivalence. Reordered keys count as drift.
- The two paths in a `SharedFile` entry can differ (e.g. `asyncapi.public.yaml` vs. `asyncapi.yaml`); the `describe` helper renders both only when they differ.
- The frontend's copy of this file exports an additional `fingerprint` function not present here; the two files are *siblings*, not the same file.
- `formatSharedFileProblems` returns `''` (not `null`/`undefined`) when there are no problems, so callers branch on string truthiness.
- The file is intentionally not a semantic diff; it is the cheapest possible guard that a silent fork has not occurred.
