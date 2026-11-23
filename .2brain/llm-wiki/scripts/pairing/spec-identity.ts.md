---
source: scripts/pairing/spec-identity.ts
source_sha256: c2d275fc8d6e4b86cbd4169f919734ccbbc8b4ff008cae3fab17ebcbe6481166
context_sha256: 98d78408a0ce35f595ac52f37a019efcbbc4c0f58306bfd40611aaf21ab7f825
generated_at: 2026-11-22T02:12:47.650200+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/pairing/spec-identity.ts

## Purpose
Defines the cross-repo contract check between this backend and the paired frontend. Some files must exist byte-for-byte identical in both checkouts, because codegen on both sides reads them and a one-line fork would go unnoticed by either CI. The file holds the list of shared files and compares them by hash (identity, not semantic equivalence). The frontend carries a near-copy of this file.

## Key elements
- `RepoRole` (`'backend' | 'frontend'`) and `siblingRole(role)`: name a side and return the other.
- `THIS_REPO`: set to `'backend'`. This is the one constant that differs from the frontend's copy, along with the frontend's extra `fingerprint` export.
- `SharedFile`: a pair of paths, `backend` and `frontend`. Two paths are needed because identical content can live at different locations.
- `SHARED_FILES`: the list of files that must be identical. Entries:
  - `openapi.yaml`
  - the public half of the async contract, which lands in the frontend as `asyncapi.yaml`
  - authorization keys YAML
  - `frontend-links.yaml`
  - `cookies.yaml`
  - three webhook-sink TLS PEM files (CA, cert, key)
- `SpecComparisonStatus` (`match | drift | missing-here | missing-there`) and `SpecComparison`: the result for one file, with both paths and sha256 hashes where the file exists.
- `hashFile(path)`: sha256 hex digest of a file.
- `compareSharedFiles(siblingRoot, here = cwd, role = THIS_REPO)`: compares every shared file against the sibling checkout. It never throws on missing files and reports them as statuses instead.
- `sharedFileProblems(comparisons)`: filters out the `match` results.
- `formatSharedFileProblems(comparisons, siblingRoot)`: builds a human-readable failure message, or returns `''` when nothing is wrong. The message ends with remediation steps: `npm run contracts:bundle`, `npm run sync:frontend`, then `gen:api` and `gen:asyncapi`.

## Relationships
- `check-spec-identity.ts` is the consumer that runs the check. It uses the compare and format functions, with the empty-string return as its pass signal.
- `sync-to-frontend.ts` applies the "backend is the source" rule, copying the shared files across. The remediation message points to `npm run sync:frontend`.
- `tests/unit/scripts/pairing/spec-identity.test.ts` unit-tests this module.
- `tests/cross-cutting/contract-bundles.test.ts` and `tests/unit/scripts/mutation/ci/waves.test.ts` also depend on it. The file shows no details of how they use it.

## Notes
- Membership rule: a file belongs in the list only if a fork would break something silently, and every entry is produced in this repo and copied to the frontend. Files kept identical only for convenience, and anything regenerable from a listed file, are excluded.
- The generated asyncapi types file and the `contract.<tool>.*` collections are deliberately excluded because they are generated outputs of listed inputs.
- Missing files are reported as statuses rather than thrown. This lets callers distinguish a wrong sibling path (everything `missing-there`) from a single deleted file.
- The failure message states that the backend copy is always correct, so no decision about which side wins is needed. Its file count comes from `SHARED_FILES.length`.
- sha256 was chosen over md5 so that hashes pasted into issues don't prompt questions about a deprecated digest.
