---
source: scripts/pairing/spec-identity.ts
sha256: 4e188a94e630658499fc15278fba0ea4f1b8b1534802a4176e3db4dbe17cb5ef
generated_at: 2026-11-08T02:56:40.833453+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/spec-identity.ts

## Purpose

Defines the cross-repo byte-identity contract: a fixed list of files that must exist in both this (backend) repo and the paired frontend, and the logic to detect when they have drifted. Because codegen on both sides reads these specs, a silent fork would break both checkouts without either CI flagging it (a forked spec is still a *valid* spec). This module is deliberately dumber than a semantic diff — identity, not equivalence.

## Key elements

- **`RepoRole`** — union type `'backend' | 'frontend'`.
- **`SharedFile`** — interface with `backend` and `frontend` path strings; supports cross-path pairs (e.g. `asyncapi.public.yaml` ↔ `asyncapi.yaml`).
- **`THIS_REPO`** — constant `'backend'`; the single value that differs from the frontend's copy of this file.
- **`siblingRole(role)`** — returns the opposite role.
- **`SHARED_FILES`** — readonly array of `SharedFile` entries. Membership rule: a fork would break something silently *and* the file is produced in the backend. Deliberately excludes regenerated outputs (`src/types/asyncapi.generated.ts`, `contract.<tool>.*` collections).
- **`SpecComparisonStatus`** — `'match' | 'drift' | 'missing-here' | 'missing-there'`.
- **`SpecComparison`** — result record: both paths, optional sha256 hashes, and status.
- **`hashFile(filePath)`** — returns the sha256 hex digest of a file's bytes.
- **`compareSharedFiles(siblingRoot, here?, role?)`** — walks `SHARED_FILES`, hashes both sides, returns one `SpecComparison` per entry. Never throws on a missing file; reports it as a status.
- **`sharedFileProblems(comparisons)`** — filters to entries whose status is not `'match'`.
- **`formatSharedFileProblems(comparisons, siblingRoot)`** — renders a human-readable diagnostic (forked hashes, missing files) plus the fix command sequence (`contracts:bundle` → `sync:frontend` → `gen:api && gen:asyncapi`). Returns `''` when clean.

## Relationships

- **`scripts/pairing/check-spec-identity.ts`** — the CLI runner that calls `compareSharedFiles` and `formatSharedFileProblems` to produce pass/fail output in CI.
- **`scripts/pairing/sync-to-frontend.ts`** — the `sync:frontend` script referenced in the remediation message; copies the backend's produced files into the frontend checkout.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — unit tests exercising `compareSharedFiles`, `sharedFileProblems`, and `formatSharedFileProblems` against fixtures.
- **`tests/cross-cutting/contract-bundles.test.ts`** — validates that the asyncapi bundles (the inputs to `asyncapi.public.yaml`) stay consistent, guarding the upstream of one `SHARED_FILES` entry.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — mutation-testing wave that includes this file's logic in its CI safety net.

## Notes

- The frontend's copy of this file is **not** byte-identical to this one: `THIS_REPO` differs (`'frontend'`) and it exports an extra `fingerprint` function this repo does not. The shared *list* and *comparison logic* are mirrored, but the files are distinct.
- `hashFile` uses **sha256**, not md5 — a conscious choice because the digest string appears in issue bodies and commit messages where a deprecated algorithm invites questions.
- `compareSharedFiles` never throws `ENOENT`; a missing file is surfaced as `missing-here` or `missing-there` so callers can distinguish "wrong sibling path" (all `missing-there`) from "someone deleted one spec" (one entry).
- `SHARED_FILES` is `as const`; the array is fixed at compile time. Adding a file is a one-line copy to the frontend's parallel list.
- The remediation message hardcodes the `npm run` command names; if scripts are renamed, the message goes stale silently.
