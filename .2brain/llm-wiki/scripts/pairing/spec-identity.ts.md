---
source: scripts/pairing/spec-identity.ts
sha256: fc60b0054a38040c0cc51311683b3e36194dee33b369b5d5fdd9aae6cd80cfef
generated_at: 2026-10-14T07:29:38.251988+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/spec-identity.ts

## Purpose

Defines and performs the cross-repo byte-identity check between this backend and its paired frontend. A small set of spec files (OpenAPI, async contract, authorization keys, TLS certs) must be byte-for-byte identical in both checkouts; a one-line edit in either side silently forks what both codebases believe they share, and neither CI detects it because a forked spec is still a *valid* spec. This module provides the file list, the comparison logic, and the human-readable failure message.

## Key elements

- **`RepoRole`** / **`THIS_REPO`** / **`siblingRole()`** — Identifies which side of the pair this checkout is (hardcoded to `'backend'` here; the frontend's copy differs only in this constant) and flips it.
- **`SharedFile`** — A pair of paths (`backend`, `frontend`) for one shared file. Two paths because the same logical file can live at different locations in each repo (e.g. `asyncapi.public.yaml` → `asyncapi.yaml`).
- **`SHARED_FILES`** — The authoritative list of 6 file pairs that must be byte-identical. Membership rule is necessity only: every entry is *produced* in this repo and copied out, so a fork has a single correct answer. Convenience-identical files (Spectral ruleset, `.prettierrc`, favicons, etc.) are deliberately excluded.
- **`SpecComparison` / `SpecComparisonStatus`** — Result of comparing one file: `match`, `drift`, `missing-here`, or `missing-there`, with sha256 hashes on both sides when available.
- **`hashFile()`** — sha256 of a file's contents (chosen over md5 to avoid the "deprecated digest" question in issue trackers).
- **`compareSharedFiles(siblingRoot, here?, role?)`** — Iterates `SHARED_FILES`, hashes both sides, and returns one `SpecComparison` per entry. Never throws on a missing file; absence is reported as a status.
- **`sharedFileProblems()`** — Filters comparisons to non-`match` entries.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — Renders a human-readable diagnostic with the forked paths, hashes, and the exact `npm run` commands to rebuild and re-sync. Returns `''` when clean so callers can branch on truthiness.

## Relationships

- **`scripts/pairing/check-spec-identity.ts`** — Same-directory consumer in the pairing folder; the CI entry point that calls `compareSharedFiles` and `formatSharedFileProblems` to gate the pipeline.
- **`scripts/pairing/sync-to-frontend.ts`** — The `sync:frontend` script referenced in the formatted failure message; it is the remediation step that copies the backend's canonical files across to the frontend checkout.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Unit tests for the comparison, hashing, and formatting logic in this module.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Exercises the async-contract pairing relationship (`asyncapi.public.yaml` ↔ `asyncapi.yaml`) that this file's `SHARED_FILES` entry guards.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI mutation-testing wave that verifies the pairing check surfaces as expected under fault injection.

## Notes

- **Identity, not equivalence.** The comparison is a raw byte hash, not a semantic diff. Two specs that mean the same thing but differ in key order are treated as a fork. This is deliberate: semantic equality is the frontend's and backend's problem to solve individually.
- **One-way authority.** Every entry in `SHARED_FILES` is *produced* in this repo (backend) and *copied* to the frontend. The frontend's copy is an output. The failure message encodes this: there is no "which side is right?" decision to make.
- **Deliberate absences are load-bearing.** `src/types/asyncapi.generated.ts` (gitignored, regenerated on every install/pre-commit) and the `contract.<tool>.*` collections (generated from `openapi.yaml`, which *is* compared) are explicitly excluded. Adding them would cost a manual step per contract change with no additional safety.
- **The `describe()` helper** (module-private) prints a single path when both sides agree on the name, or `file ↔ siblingFile` when they differ — used only in the formatted output.
