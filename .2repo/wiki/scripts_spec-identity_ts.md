# scripts/spec-identity.ts

## Purpose

Implements the cross-repo contract identity gate: a byte-for-byte (sha256) check that a small set of spec files are identical between this backend repo and its paired frontend. It exists because a one-line edit in one checkout silently forks what both sides believe they share, and neither CI catches it because a forked spec is still a valid spec. Deliberately identity, not equivalence.

## Key elements

- **`RepoRole`** / **`THIS_REPO`** — union type `'backend' | 'frontend'` and the single constant that differs between the two mirrored copies of this file.
- **`SharedFile`** — interface pairing a backend path with a (possibly different) frontend path.
- **`SHARED_FILES`** — the definitive list of files that must be byte-identical across repos. Currently two entries: `openapi.yaml` (same name both sides) and `asyncapi.public.yaml` → `asyncapi.yaml` (renamed on arrival). Membership rule: the file is *produced* in this repo and copied to the frontend; generated artifacts and convenience-identical files are excluded.
- **`siblingRole(role)`** — returns the opposite `RepoRole`.
- **`hashFile(filePath)`** — sha256 hex digest of a file's contents.
- **`compareSharedFiles(siblingRoot, here?, role?)`** — walks `SHARED_FILES`, hashes both sides, and returns a `SpecComparison[]` with status `'match' | 'drift' | 'missing-here' | 'missing-there'`. Never throws on missing files.
- **`SpecComparison`** / **`SpecComparisonStatus`** — result shape carrying both paths, both hashes (when present), and the status.
- **`sharedFileProblems(comparisons)`** — filters to entries where status ≠ `'match'`.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a human-readable multi-line message (file, hashes, remediation steps). Returns `''` when clean so callers can branch on truthiness.

## Relationships

- **`scripts/check-spec-identity.ts`** — the CLI runner; imports `compareSharedFiles` and `formatSharedFileProblems` to perform the check and print the result.
- **`scripts/sync-shared-files-to-frontend.ts`** — the remediation path referenced in the formatted failure message (`npm run sync:frontend`); it copies the backend-produced files into the frontend checkout.
- **`tests/unit/scripts/spec-identity.test.ts`** — unit tests for the comparison, filtering, and formatting logic.
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the shared-file list in the context of the asyncapi bundle generation that produces `asyncapi.public.yaml`.

## Notes

- The file is **mirrored** in the frontend repo; only `THIS_REPO` differs (`'frontend'` there). Adding a shared file is a one-line copy on the other side.
- `SHARED_FILES` is intentionally narrow. Files identical by convention (favicons, `.prettierrc`, shared lint rules) were removed rather than flagged, because a gate that fails on an icon trains people to ignore it.
- Generated outputs (`src/types/asyncapi.generated.ts`, `contract.<tool>.*`) are excluded: they are derived from files already in the list, so a separate comparison adds no signal.
- `asyncapi.public.yaml` / `asyncapi.yaml` is the one pair where the path **name** differs between repos; `describe()` renders that pair as `file ↔ siblingFile` in messages.
- The remediation instructions in `formatSharedFileProblems` assume the backend is the source of truth — the frontend's copy is always an output, so "which side is right" never needs a human decision.
