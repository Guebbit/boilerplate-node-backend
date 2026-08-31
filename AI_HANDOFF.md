# AI handoff

## What this is

This file preserves the recoverable context for the `copilot/perfect-domain-feature-architecture` branch so another AI can continue without re-discovering the branch history.

## Task to continue

Continue the architecture-focused modernization of the `api-mongodb-mongoose` flavor while preserving the work already accumulated on this branch.

## Current git state

- Repository: `Guebbit/boilerplate-node-backend`
- Local branch: `copilot/perfect-domain-feature-architecture`
- Base branch to compare against: `api-mongodb-mongoose`
- This branch matched `main` at commit `86a7019` before this handoff note was added.
- There is already an open archival PR covering the large branch delta: **PR #166** (`main` -> `api-mongodb-mongoose`, title `save`).
- This handoff PR exists to preserve context, not to replace the broader branch history.

## Recovered intent

From the branch name, repository instructions, docs, and commit history, the direction appears to be:

- make the boilerplate more modular and future-proof
- push shared technical concerns down into `src/core/**`
- keep the request flow explicit (`routes -> middlewares -> controllers -> services -> repositories -> models`)
- keep contracts/documents aligned with implementation
- move toward stricter architectural boundaries

## What has already been done on this branch

The recoverable history against `api-mongodb-mongoose` is large, but the highest-signal milestones are:

1. **Infrastructure and observability expansion**
    - Docker/docs/observability assets were expanded heavily.
    - CI, mutation, fuzzing, and CodeQL workflows were added or strengthened.

2. **Contract-first cleanup**
    - OpenAPI/AsyncAPI-driven work was added and repeatedly corrected.
    - Generated API artifacts and schema helpers were expanded significantly.

3. **Core refactor away from `src/utils`**
    - Shared technical code was moved into clearer homes such as:
        - `src/core/adapters`
        - `src/core/bootstrap`
        - `src/core/http`
        - `src/core/observability`
        - `src/jobs`
        - `src/repositories`
        - `src/services`
    - `eslint.config.ts` now enforces that `src/core/**` does not import upward into controllers/services/repositories/models/jobs/middlewares.

4. **Behavioral fixes and model changes**
    - The branch history includes contract fixes, cart persistence changes, audit persistence work, error-shape fixes, and test-driven bug fixes.

5. **Documentation hardening**
    - The docs now explain the layer map, testing strategy, observability stack, and several deliberate non-goals in much more detail than the base branch.

## Important current reality

The codebase is **better layered**, but it is **not yet feature-foldered**.

Evidence:

- `docs/theory/layers.md` still documents the primary structure as:
    - `src/routes`
    - `src/middlewares`
    - `src/controllers`
    - `src/services`
    - `src/repositories`
    - `src/models`
- The repository now has stronger technical boundaries around `src/core/**`, but the app still reads as a layered backend rather than a domain/feature package layout.

If the real goal is a fully feature-oriented architecture, that work is still incomplete.

## Steps already taken for this rescue PR

1. Checked the repository status and confirmed there were no local uncommitted changes before this file.
2. Identified the current branch and fetched full history plus the missing base branches.
3. Confirmed this branch matches `main` before this file, so the meaningful delta is still the broader `api-mongodb-mongoose...HEAD` history.
4. Identified the existing archival PR #166 that already snapshots that broader diff.
5. Reviewed the branch commit history and current docs to recover the highest-signal intent and remaining gaps.
6. Added this handoff file so the context is preserved inside git and the PR itself.

## Missing steps for the next AI

1. **Clarify the real end-state**
    - Decide whether the target is:
        - a stricter layered architecture, or
        - a true feature/domain-oriented folder structure
    - The current repository shows strong progress on layering and boundaries, but not the second one.

2. **Review PR #166 before changing structure further**
    - It is the existing umbrella snapshot of the accumulated branch work.
    - Use it to inspect the full cross-branch delta instead of re-deriving the change set from scratch.

3. **If feature architecture is still the goal, identify the next safe slice**
    - likely start by defining public feature entry points and import rules
    - then move one domain at a time instead of attempting a full rewrite in one pass
    - keep `openapi.yaml` and docs aligned whenever behavior or contracts move

4. **Re-check boundary enforcement**
    - `src/core/**` restrictions exist
    - feature-boundary restrictions do not yet appear complete from the current repository shape

5. **Inspect known follow-up signals**
    - `src/core/adapters/image-store.ts` still carries a TODO about a durable image-storage implementation
    - re-scan for architecture-related TODOs before starting the next refactor slice

6. **Validate from the intended base branch**
    - Run the repo's existing checks against the exact branch state you plan to continue from
    - especially build, lint, tests, docs/spec checks, and any PR-specific CI failures

## Validation status for this handoff PR

- `npx prettier --check AI_HANDOFF.md` ✅
- secret scan on `AI_HANDOFF.md` ✅
- automated code review: no comments returned; the review binary was unavailable in this environment, so this result should be treated as non-blocking metadata
- CodeQL check skipped automatically because this PR is documentation-only/trivial

## Suggested continuation prompt for the next AI

Use `AI_HANDOFF.md` first, then inspect PR #166 and the `api-mongodb-mongoose...copilot/perfect-domain-feature-architecture` diff. Treat the current repository as a large modernization branch that already improved layering and technical boundaries, but has not yet completed a full domain/feature-oriented reorganization.
