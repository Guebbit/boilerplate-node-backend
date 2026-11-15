---
source: scripts/pairing/spec-identity.ts
sha256: dbd86ffa026b5e8f0f94e5e63753708094ef83624dd8dd54bae8b0fab62cfd20
generated_at: 2026-11-14T17:39:09.161635+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/spec-identity.ts

## Purpose

Defines the cross-repo byte-identity contract: a canonical list of spec files that must be **byte-for-byte identical** in both the backend and frontend checkouts, plus the logic to compare them and report drift. It exists because a one-line edit in one checkout silently forks what both sides believe they share, and a forked spec is still a *valid* spec, so no CI check would otherwise catch it.

## Key elements

- **`THIS_REPO`** (`'backend'`) — the single value that differs from the frontend's copy of this file.
- **`siblingRole(role)`** — flips `backend` ↔ `frontend`.
- **`SHARED_FILES: readonly SharedFile[]`** — the authoritative list of paired files (e.g. `openapi.yaml`, `asyncapi.public.yaml`→`asyncapi.yaml`, authorization keys, frontend links, cookies, TLS certs). Each entry carries both paths because the two repos need not store the file at the same location.
- **`SpecComparison` / `SpecComparisonStatus`** — per-file result: `match | drift | missing-here | missing-there`, with optional sha256 digests.
- **`hashFile(filePath)`** — sha256 hex of a file's contents.
- **`compareSharedFiles(siblingRoot, here?, role?)`** — walks `SHARED_FILES`, returns a `SpecComparison` per entry. Never throws on a missing file; absence is its own status.
- **`sharedFileProblems(comparisons)`** — filters to non-`match` entries.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a human-readable diagnostic (or `''` when clean). Includes the remediation commands (`contracts:bundle`, `sync:frontend`, `gen:api`, `gen:asyncapi`).
- **`describe()`** *(private)* — formats a pair as one path or `a ↔ b` when the paths differ.

## Relationships

- **`scripts/pairing/check-spec-identity.ts`** — CLI entry point that calls `compareSharedFiles` and `formatSharedFileProblems` to gate a CI step or local check.
- **`scripts/pairing/sync-to-frontend.ts`** — the remediation path referenced in the formatted error message (`npm run sync:frontend`); copies the backend-produced files into the frontend checkout.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — unit tests exercising `compareSharedFiles`, `sharedFileProblems`, and `formatSharedFileProblems` in isolation.
- **`tests/cross-cutting/contract-bundles.test.ts`** — tests the bundle-generation logic that produces one of the entries listed in `SHARED_FILES`, verifying that the two bundle halves cannot describe a shared channel differently.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — mutation-testing harness that confirms the identity check actually fires in CI (is not dead code).

## Notes

- **Identity, not equivalence.** The check is deliberately a byte comparison (sha256). Two specs that are semantically equal but differ in key order are still flagged as `drift` — a fork in the making.
- **Membership rule is NECESSITY.** A file earns a spot only if a fork would silently break something. Convenience-identical files and regenerable outputs are excluded (documented in `docs/tools/pairing-and-ports.md`).
- **Deliberate absences:** `src/types/asyncapi.generated.ts` (gitignored, regenerated pre-commit, and the two sides are *not* meant to match) and the `contract.<tool>.*` collections (generated from `openapi.yaml`, which is already listed).
- **Frontend copy differences:** the frontend's version of this file has `THIS_REPO = 'frontend'` and exports an extra `fingerprint` function (unused here) because it pairs with either backend twin.
- **`formatSharedFileProblems` returns `''`** (empty string) when all files match, so callers can branch on truthiness rather than array length.
- **sha256 over md5** is a cosmetic choice: the digest is printed into issues and commit messages, and a deprecated algorithm there invites recurring questions.
