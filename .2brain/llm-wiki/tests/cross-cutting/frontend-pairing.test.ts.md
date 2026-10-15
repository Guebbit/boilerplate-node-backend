---
source: tests/cross-cutting/frontend-pairing.test.ts
sha256: 341e595cd62a804d3c209abcf2cd1fcdf8be6e92178dd6d685ba737a414875d8
generated_at: 2026-10-15T12:37:50.332491+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/frontend-pairing.test.ts

## Purpose

Cross-repository pairing guard. Verifies that every backend module either names its frontend counterpart as the same name (or supplies a `why` for the mismatch), and—when a paired Vue frontend is checked out—that the names claimed in this repo's descriptors match the actual module folders on the other side, in both directions.

## Key elements

- **`DESCRIPTORS`** — all module descriptors read from `MODULES_ROOT` at load time; the single source of truth for this test's assertions.
- **`FRONTEND_ONLY`** — record of frontend modules that have no backend counterpart. Currently empty; exists as an explicit escape hatch.
- **`siblingExpected` / `siblingPresent`** — booleans gating the second half: whether `FRONTEND_PATH` was set and whether `src/modules` actually exists at the resolved path.
- **`frontendModules()`** — lists top-level directories in the paired frontend's `src/modules/`.
- **`claimedNames()`** — union of every name produced by `frontendCounterparts` across all descriptors plus the keys of `FRONTEND_ONLY`.
- **`describe('the two repositories, module by module')`** — first half: checks descriptor count > 0 and that every non-same-name counterpart carries a `frontend.why` field.
- **`describe('the paired frontend at …')`** — second half (skipped visibly if no checkout): asserts claimed names exist on the frontend, and that every frontend module folder is accounted for here.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — provides `readAllModuleDescriptors` (to build `DESCRIPTORS`) and `frontendCounterparts` (to resolve each module's claimed frontend names).
- **`scripts/pairing/paired-frontend-path.ts`** — provides `resolveFrontendPath()`, which yields the absolute path to the sibling Vue checkout used by the second half.
- **`tests/support/paths.ts`** — provides `MODULES_ROOT`, the directory under which this repo's `module.yaml` files are read.

## Notes

- The second half is **visibly incomplete** (a `console.warn` + empty-assertion) when `FRONTEND_PATH` is unset rather than passing silently. The CI counterpart for the no-frontend case lives in `tests/unit/scripts/pairing/spec-identity.test.ts`.
- Top-level `if (!siblingPresent) return;` short-circuits the remaining `it` blocks; this is intentional Jest behavior (not a test failure) and relies on `siblingPresent` being computed synchronously at module load.
- The `console.warn` line carries an `eslint-disable no-console` because no logger is available in this test context.
- The file's header comment enumerates the known asymmetries (`access`, `antibot`, `addresses`, `invoicing`, `audit-logs`) as architecture, not drift—those names are expected to lack a same-name counterpart.
