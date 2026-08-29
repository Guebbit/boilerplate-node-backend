# scripts/spec-identity.ts

## Purpose

Cross-repo contract identity check. A small set of spec files must exist byte-for-byte identical in both the backend and the paired frontend checkout. This module defines *which* files are shared, *how* they map across the two repos (paths can differ), and provides the comparison and reporting primitives. It exists because a silent fork of a shared spec is still a valid spec on each side, so no per-repo CI will catch it.

## Key elements

- **`RepoRole`** (`'backend' | 'frontend'`) — identifies which side of the pair a checkout belongs to.
- **`SharedFile`** — an interface with `backend` and `frontend` string paths; a pair whose paths may differ between repos.
- **`THIS_REPO`** — constant `'backend'`; the one value that differs from the frontend's mirrored copy of this file.
- **`siblingRole(role)`** — returns the opposite `RepoRole`.
- **`SHARED_FILES`** (`readonly SharedFile[]`) — the authoritative list of files that must be identical across both repos (currently: `openapi.yaml`, `asyncapi.public.yaml` → `asyncapi.yaml`, and the analytics-events pair with differing paths).
- **`SpecComparisonStatus`** / **`SpecComparison`** — status and result types for a single file's comparison (`match`, `drift`, `missing-here`, `missing-there`).
- **`hashFile(filePath)`** — returns the SHA-256 hex digest of a file's contents.
- **`compareSharedFiles(siblingRoot, here?, role?)`** — walks `SHARED_FILES`, hashes both sides, and returns a `SpecComparison[]`. Never throws on a missing file; absence is a status.
- **`sharedFileProblems(comparisons)`** — filters to entries whose status is not `'match'`.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a human-readable diagnostic string (empty string when clean) including remediation steps (`contracts:bundle` + `sync:frontend`).

## Relationships

- **`scripts/check-spec-identity.ts`** — CLI entry point; imports `compareSharedFiles`, `formatSharedFileProblems`, and `THIS_REPO` to run the check and exit non-zero on drift.
- **`scripts/sync-shared-files-to-frontend.ts`** — the remediation step referenced in the error message; copies the backend's shared files into the frontend checkout.
- **`tests/unit/scripts/spec-identity.test.ts`** — unit tests exercising `compareSharedFiles`, `sharedFileProblems`, and `formatSharedFileProblems` with mocked file trees.
- **`tests/cross-cutting/contract-bundles.test.ts`** — validates that the contract bundle outputs (`openapi.yaml`, `asyncapi.public.yaml`) actually satisfy the invariants `SHARED_FILES` assumes (e.g., the async subset is a strict subset of the full doc).

## Notes

- The identity test is deliberately **byte-exact**, not semantically equivalent. Two YAML docs that parse to the same object but differ in key order are a drift.
- Membership in `SHARED_FILES` is intentionally narrow: every entry must be **produced in this repo** and copied to the frontend as an output. Convenience-identical files (`.prettierrc`, favicons, `.husky/*`, etc.) were removed because a fork there is harmless and a gate failure would train people to ignore it.
- Generated artifacts whose inputs are already in the list (e.g. `asyncapi.generated.ts`, `contract.<tool>.*`) are excluded to avoid a redundant manual step per contract change; each is guarded by its own freshness check.
- `describe` is module-private (not exported). The cross-path pair (`asyncapi.public.yaml` ↔ `asyncapi.yaml`) is the only case where `file !== siblingFile` in the output.
- The frontend keeps a mirror of this file; only `THIS_REPO` differs. Adding a shared file is a one-line copy on the other side.
