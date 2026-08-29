# tests/cross-cutting/frontend-pairing.test.ts

## Purpose

Cross-repo pairing test that verifies the hand-written `FRONTEND_PAIRING` map stays consistent with both this backend's enabled modules and the actual module folders in the paired `boilerplate-vue-frontend` checkout. It catches drift in either direction (renamed, added, or removed modules on either side) and forces a written justification wherever the two repos do not use the same name for a domain.

## Key elements

- **`Pairing` interface** — shape of one entry: `counterparts` (array of frontend module names) and optional `why` (one-sentence explanation, required when names differ or list is empty).
- **`FRONTEND_PAIRING`** — the authoritative mapping from backend module names to frontend counterparts; thirteen entries covering all enabled backend modules.
- **`FRONTEND_ONLY`** — records frontend modules (`demo`) that have no backend counterpart, with a standing explanation.
- **`moduleNames()`** — derives the enabled backend module name list from `enabledModules`.
- **`frontendModules()`** — reads directory entries under the sibling's `src/modules/` folder.
- **`claimedNames()`** — union of all frontend names referenced in both maps, used for the cross-repo "accounts for every module" check.
- **`describe('the two repositories, module by module', …)`** — self-consistency suite: every enabled module has an entry, no entry references a disabled module, divergent names carry a `why`, and every `FRONTEND_ONLY` entry has a non-empty explanation.
- **`describe('the paired frontend at …', …)`** — cross-repo suite (skipped when the sibling is absent): asserts every claimed name exists over there and every folder over there is claimed.

## Relationships

- **`src/modules.ts`** — imports `enabledModules` to obtain the canonical list of backend module names that must each appear in `FRONTEND_PAIRING`.
- **`scripts/paired-frontend-path.ts`** — imports `resolveFrontendPath()` to locate the sibling frontend checkout; the result drives both the `describe` label and the existence check that gates the cross-repo half.
- **`docs/theory/module-lifecycle.md`** — referenced in the file's header comment as background reading on the two-repository model; the test encodes the pairing decisions that doc describes.

## Notes

- **Stated, not derived.** The pairing is a written architectural decision, not something a name-matcher can infer. The `why` field exists precisely because a reader cannot guess the mapping (e.g. `audit-logs` → `admin`).
- **Conditional cross-repo half.** If the sibling checkout is missing the second `describe` block degrades to a single warning (non-CI) or a no-op assertion (CI). The file deliberately makes the absence visible rather than passing silently — same convention as `tests/unit/scripts/spec-identity.test.ts`.
- **`console.warn` is intentional.** An `eslint-disable-next-line no-console` suppresses the lint rule because the warning must reach a bare terminal where no logger is configured.
- **`FRONTEND_ONLY` is a one-way declaration.** It exists only in this file; nothing in the backend module list can discover a frontend-only module, so the "accounts for every module over there" test is the only guard against an unlisted frontend folder appearing.
