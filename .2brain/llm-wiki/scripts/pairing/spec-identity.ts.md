---
source: scripts/pairing/spec-identity.ts
sha256: 617707d68ade5ba48d9e592a685ebdda55dd8d8dac1557c1d02aba3e56bc3228
generated_at: 2026-09-23T17:31:26.195503+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/spec-identity.ts

## Purpose

Defines and enforces the byte-for-byte identity contract between this (backend) repo and its paired frontend. It lists the small set of files that must be identical in both checkouts, hashes them, and produces a human-readable diagnostic when they have drifted. The check exists because a forked spec is still a *valid* spec, so neither repo's CI catches the disagreement until production.

## Key elements

- **`SHARED_FILES`** — `readonly SharedFile[]` listing the pairs that must match. Currently two entries: `openapi.yaml` (same name both sides) and `asyncapi.public.yaml` → `asyncapi.yaml` (cross-path pair). Membership rule is *necessity only*: the file is produced in the backend and copied out.
- **`THIS_REPO`** / **`siblingRole()`** — the single value that differs from the frontend's copy of this file; `siblingRole` flips `backend` ↔ `frontend`.
- **`hashFile(path)`** — returns the sha256 hex digest of a file.
- **`compareSharedFiles(siblingRoot, here?, role?)`** — iterates `SHARED_FILES`, resolves both paths, and returns one `SpecComparison` per entry with status `match | drift | missing-here | missing-there`. Never throws on a missing file.
- **`sharedFileProblems(comparisons)`** — filters out `match` entries.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a multi-line failure message (file, hashes, remediation commands). Returns `''` when clean; callers branch on truthiness.
- **`SpecComparison` / `SpecComparisonStatus`** — the result shape per file, carrying both paths and both hashes (or `undefined` when absent).

## Relationships

- **`scripts/pairing/check-spec-identity.ts`** — the CLI entry point that calls `compareSharedFiles` and `formatSharedFileProblems` to gate a workflow step.
- **`scripts/pairing/sync-to-frontend.ts`** — the remediation script named in the failure message (`npm run sync:frontend`); it copies the backend-produced shared files into the frontend checkout.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — unit tests for the hashing, comparison, and formatting logic.
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the identity check as part of a broader cross-repo contract suite.

## Notes

- **Byte-identity, not equivalence.** Two specs that are semantically identical but differ in key order are still a failure. This is intentional: "a fork in the making."
- **Cross-path pair.** `asyncapi.public.yaml` (backend) maps to `asyncapi.yaml` (frontend). `SHARED_FILES` stores both paths explicitly; a single-path list could not express this.
- **Deliberate exclusions.** Convenience-identical files (Spectral ruleset, favicon, `.prettierrc`, `.husky/*`, etc.) and regenerated outputs (`asyncapi.generated.ts`, `contract.<tool>.*`) are *not* members. A gate on an icon "trains people to ignore it"; a generated copy carries no fact the list does not already compare.
- **`formatSharedFileProblems` returns `''` on success**, not `null` or an empty array. Callers should check truthiness.
- **sha256, not md5**, chosen so a checksum pasted into a commit message doesn't invite deprecation questions.
