---
source: scripts/pairing/spec-identity.ts
sha256: 2c46acf6ec29e4acb40a944fd5fd613e81488cf88b5ec4a682ad8b9cb1383bc3
generated_at: 2026-10-29T01:40:53.027381+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/spec-identity.ts

## Purpose

Cross-repo byte-identity guard for a fixed set of contract files shared between this backend repo and its paired frontend. It detects silent spec drift (a one-line edit in one checkout that diverges from the other) that would otherwise pass CI because a forked spec is still a valid spec. The check is deliberately identity-based (sha256 equality), not semantic.

## Key elements

- **`THIS_REPO`** (`RepoRole`) — the single constant that differs from the frontend's copy of this file; always `'backend'` here.
- **`siblingRole(role)`** — flips `'backend'` ↔ `'frontend'`.
- **`SHARED_FILES`** (`readonly SharedFile[]`) — the authoritative list of files that must be byte-identical in both checkouts. Each entry carries a `backend` and `frontend` path (they differ for cross-path pairs like `asyncapi.public.yaml` → `asyncapi.yaml`).
- **`hashFile(filePath)`** — sha256 hex digest of a file's contents.
- **`compareSharedFiles(siblingRoot, here?, role?)`** — walks `SHARED_FILES`, hashes both sides, returns a `SpecComparison[]` with status `'match' | 'drift' | 'missing-here' | 'missing-there'`. Never throws on absent files.
- **`sharedFileProblems(comparisons)`** — filters out `'match'` entries.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a human-readable remediation message (or `''` when clean). Includes the exact `npm run` commands to rebuild and re-sync.

## Relationships

- **`scripts/pairing/check-spec-identity.ts`** — CI entry point that imports `compareSharedFiles` / `formatSharedFileProblems` and exits non-zero on drift.
- **`scripts/pairing/sync-to-frontend.ts`** — the fix action named in the error message (`npm run sync:frontend`); copies the backend's shared files into the frontend checkout.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — unit tests for hashing, comparison status logic, and formatting.
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the bundle generation that *produces* the files listed in `SHARED_FILES`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — verifies CI wave behavior when spec-identity failures are injected.

## Notes

- **Identity, not equivalence.** Key-order changes, reformatting, or comment edits in a shared file all count as drift. This is intentional: the goal is to catch any uncoordinated edit, not just semantic ones.
- **Cross-path pairs.** Some shared files live at different relative paths in each repo (e.g. `asyncapi.public.yaml` here vs `asyncapi.yaml` there). The `SharedFile` interface exists specifically to express that; a flat path list would be insufficient.
- **Deliberate exclusions.** `src/types/asyncapi.generated.ts` and the `contract.<tool>.*` collections are *not* in `SHARED_FILES` — they are regenerable outputs whose inputs are already compared. The `SHARED_FILES` docblock records the reasoning.
- **Membership rule is necessity, not convenience.** A file earns a slot only if forking it would break something silently. Files kept identical "for convenience" or regenerable from a listed file are excluded.
- **The frontend's copy of this file** is nearly identical but differs in `THIS_REPO` (set to `'frontend'`) and exports a `fingerprint` helper this repo does not use.
