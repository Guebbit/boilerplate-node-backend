---
source: tests/unit/scripts/pairing/spec-identity.test.ts
sha256: 363886f1e9ab2e3225009fbebd1df3131fcd0ce06436a23fbfd98bc4c304bac8
generated_at: 2026-11-08T10:39:58.378162+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/spec-identity.test.ts

## Purpose

Unit tests for `scripts/pairing/spec-identity.ts`, the cross-repo contract check that verifies shared specification files (OpenAPI, AsyncAPI, seed identities, TLS certs) remain byte-identical between the backend and frontend checkouts. Tests run against synthetic temp directories so they work on any CI runner or standalone clone, plus one conditional live assertion against the real sibling repo when it is present.

## Key elements

- **`makeRoot(files)`** — creates a throwaway `mkdtempSync` root and writes the given `{path: contents}` map into it.
- **`sharedFiles(role, suffix?)`** — produces a fixture record for one repo side, keyed by `SHARED_FILES` pair entries. Contents are indexed by pair position (not filename) so the two sides can carry different paths for the same file.
- **`sharedFilesWith` / `withoutFile`** — convenience wrappers that replace or delete a single entry from `sharedFiles`, used to construct drift and missing-file scenarios.
- **`CROSS_PATH`** — the `SHARED_FILES` entry whose `backend` and `frontend` paths differ (e.g. `asyncapi.public.yaml` vs `asyncapi.yaml`); guards that the pair structure can express cross-path cases.
- **`describe('SHARED_FILES')`** — meta-assertions on the contract list: exact membership (8 files), exclusion of generated outputs, presence of at least one cross-path pair, and no duplicate paths on either side.
- **`describe('compareSharedFiles')`** — exercises match, cross-path match, drift (one-byte and cross-path), missing-sibling (`missing-there`), missing-local (`missing-here`), and empty-both cases.
- **`describe('hashFile')`** — verifies the digest helper: same contents → same hash, different contents → different hash.

## Relationships

- **`scripts/pairing/spec-identity.ts`** — the module under test; this file imports `SHARED_FILES`, `compareSharedFiles`, `formatSharedFileProblems`, `hashFile`, `sharedFileProblems`, and the `RepoRole` type.
- **`scripts/pairing/paired-frontend-path.ts`** — imported for `resolveFrontendPath`, used in the conditional "real pair" test that asserts against the live sibling checkout.

## Notes

- Fixtures are derived from `SHARED_FILES` rather than hardcoded, so adding a file to the contract automatically exercises it in every test case — no test edits needed.
- File contents are keyed by **index** in `SHARED_FILES`, not by path, because the two repos may name the same file differently (the cross-path case). Keying by path would make every pair look forked.
- The conditional live-pair test **skips** (does not silently pass) when the sibling repo is absent, so a missing checkout is visibly reported rather than masquerading as green.
- `CONVENIENCE` (`shared/contracts/spectral.yaml`) is deliberately **excluded** from `SHARED_FILES`; it appears in fixtures only as a negative-case assertion that the comparator ignores files outside the list.
- Temp roots are tracked in a `roots` array and cleaned up in a single `afterAll` via `rmSync(…, { recursive: true, force: true })`.
