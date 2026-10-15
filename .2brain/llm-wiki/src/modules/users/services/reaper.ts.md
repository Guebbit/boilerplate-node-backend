---
source: src/modules/users/services/reaper.ts
sha256: 39d965fd002b2d60a891bd738a3a401b6e8941782b4371d5b45cf00feb86f33c
generated_at: 2026-10-15T12:11:14.854428+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/reaper.ts

## Purpose

Provides the per-stage query and action functions for the inactivity reaper: finding candidates at each lifecycle stage (warn → soft-delete → hard-delete → personal-data minimisation) and executing the minimise step. A shared `customersOnly` guard ensures only accounts at the `user` access level are ever returned or acted upon.

## Key elements

- **`customersOnly`** (private) — Filters a candidate list down to accounts whose access level is exactly `'user'`, using `levelsOfMany`. Applied after every repository read.
- **`findInactiveUnwarned(cutoff)`** — Returns accounts inactive past `cutoff` and never yet warned (reaper's first stage).
- **`findWarnedStillInactive(warnedBefore)`** — Returns accounts warned before `warnedBefore` with no activity since (soft-delete stage).
- **`findReaperSoftDeletedPastGrace(cutoff)`** — Returns reaper-soft-deleted accounts past their own grace window (hard-delete stage).
- **`findInactiveUnminimised(cutoff)`** — Returns accounts quiet since before `cutoff` not yet minimised for this inactivity stretch.
- **`minimiseInactive(user)`** — Runs every registered `personalData.minimise` hook sequentially for one account, then stamps the account as minimised. The stamp is written only after all hooks succeed.
- **`minimiseInactiveBefore(cutoff)`** — Iterates all candidates from `findInactiveUnminimised`, calling `minimiseInactive` per account. Catches per-account errors (logs and continues) and returns `{ minimised, failed }` counts.

## Relationships

- **`@modules/access`** (`src/modules/access/index.ts`, backed by `service.ts`) — `levelsOfMany` is called inside `customersOnly` to resolve each candidate's access level.
- **`src/modules/users/repository.ts`** — All database reads (`findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `findInactiveUnminimised`) and the `markInactivityMinimised` write go through `userRepository`.
- **`src/modules/users/erasure-registry.ts`** — `personalDataMinimisers()` supplies the list of minimise hooks executed by `minimiseInactive`.
- **`src/modules/users/model.ts`** — `UserDocument` type used throughout signatures.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` records failed minimise attempts inside `minimiseInactiveBefore`.
- **`src/modules/users/services/index.ts`** — Barrel file that re-exports this module's public API.

## Notes

- The `customersOnly` guard is the single safety mechanism preventing staff/admin accounts from being reaped. It runs *after* the repository query, so the DB may still return non-`user` rows; the filter is the last line of defence.
- In `minimiseInactive`, the `markInactivityMinimised` stamp is written only after every hook resolves successfully. If any hook throws, the stamp is never written, so the account is picked up again on the next reaper run.
- `minimiseInactiveBefore` is intentionally non-atomic across accounts: one failure increments `failed` and the loop continues. There is no transaction wrapping the whole batch.
- The other three stages (`findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`) are read-only here; the actual warn / soft-delete / hard-delete writes are expected to be performed by the caller (`scripts/ops/reap-inactive-accounts.ts`).
