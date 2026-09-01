# INFRASTRUCTURE_LAYOUT_PLAN.md

## Purpose

A backlog-with-verdicts document explaining why `src/infrastructure/http` has accreted beyond its documented role, which neighbouring infrastructure folders contradict their own rules in `docs/theory/layers.md`, and the concrete (partially executed) steps to fix each issue. It does not restate the layering theory; it records the drift and the cost of correcting it.

## Key elements

- **Status block** — Records execution state as of 2026-08-30: steps 1–4 done (uncommitted), step 5 deferred. Documents two same-day changes that altered the original plan (controller.ts exclusion; folder renamed to `surfaces/`).
- **The finding** — Argues `http` is named for a protocol while its siblings are named for a job, making it impossible to refuse content. Identifies four altitude groups inside `http` (controller factories, wire dialect, input decoding, pipeline) and states only the first group is misfiled.
- **Neighbour contradictions** — `adapters` description too narrow (docs bug); `runtime/managed-connection.ts` is a library, not a startup step; `i18n` missing from the `layers.md` table entirely.
- **Smaller inconsistencies** — `security.ts` name collision (resolved by rename to `rate-limit.ts`); duplicate basenames across layers; two shapes for one port pattern; two files exceeding the ~300-line guideline.
- **The plan (steps 1–5)** — Ordered by cost: (1) add admission-test column to `layers.md`; (2) move controller factories to `surfaces/`; (3) update `eslint.config.ts` import guards (mooted by step 2's actual scope); (4) rename `security.ts` → `rate-limit.ts`; (5) deferred split of oversized files. Each step includes rationale, suggested wording, cost estimate, and a "Done" annotation.
- **Gate note** — `npm run complete` (full type-check, lint, dependency check, spec validation, docs build, 214 test suites) passes clean against the moved tree.

## Relationships

No dependency-graph neighbours are recorded for this file. It is a standalone planning document that *references* `docs/theory/layers.md` (authority on tier definitions), `docs/theory/request-input.md` (defines `RequestSurface` / `SURFACE_SOURCES`), `docs/reference/src-infrastructure.md`, and `CONTRACT_PLAN_POLYMORPHISM.md` (stylistic template). It does not import or export any code.

## Notes

- Written in the "shape of" `CONTRACT_PLAN_POLYMORPHISM.md`; treat it as a one-time backlog, not a living spec.
- The folder name `surfaces/` was chosen deliberately over `controllers/` (mechanism-shaped, homonym with per-module `controllers/`) and `controller-factories/` (invented compound). The word already exists in `http/request.ts` and `docs/theory/request-input.md`.
- `controller.ts` (generic helpers: `refused`, `catchAs`, `rejectValidation`, `parseBody`) stays in `http/` — it was never a factory and takes an Express `Response`, satisfying `http`'s admission test.
- Step 3's planned `eslint.config.ts:530` edit was never applied because the file it guards (`@infrastructure/http/controller`) did not move.
- Numbers (import counts, LOC) are restated at measured values where they differ from the original draft; trust the "Done" annotations over the initial estimates.
