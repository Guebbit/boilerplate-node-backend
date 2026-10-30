---
source: src/modules/users/services/reaper.ts
sha256: 2109ec1e01a170e4b2d29b852ccc376dcf6b34cb6a368bb02396de228b1a048c
generated_at: 2026-10-29T06:18:03.151927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/reaper.ts

## Purpose

Provides the per-stage read queries and the personal-data minimisation step for the inactivity reaper. Each exported function corresponds to one stage of the reaper's lifecycle (warn → soft-delete → hard-delete → minimise) and always excludes staff/administrator accounts before returning results.

## Key elements

- **`customersOnly`** (private helper) — calls `accessService.staffHoldersAmong` and filters the candidate list down to non-staff accounts. Applied inside every exported read.
- **`findInactiveUnwarned(cutoff)`** — Stage 1: accounts inactive past `cutoff` and never yet warned.
- **`findWarnedStillInactive(warnedBefore)`** — Stage 2: accounts warned before `warnedBefore` with no activity since (soft-delete candidates).
- **`findReaperSoftDeletedPastGrace(cutoff)`** — Stage 3: accounts soft-deleted by the reaper past its own grace window (hard-delete candidates).
- **`findInactiveUnminimised(cutoff)`** — Stage 4: accounts inactive past `cutoff` not yet minimised for this inactivity stretch.
- **`minimiseInactive(user)`** — Runs every registered `personalDataMinimisers()` hook sequentially for one account, then stamps the account as minimised. The stamp is written only if all hooks succeed.
- **`minimiseInactiveBefore(cutoff)`** — Bulk wrapper: iterates all candidates from `findInactiveUnminimised`, tolerates per-account failures (logs each one), and returns `{ minimised, failed }`.

## Relationships

- **`src/modules/users/repository.ts`** — All four read functions delegate their actual DB queries to `userRepository` methods of the same name.
- **`src/modules/access/index.ts`** → **`src/modules/access/services/index.ts`** — `accessService.staffHoldersAmong` is used inside `customersOnly` to identify and exclude staff/admin accounts.
- **`src/modules/users/erasure-registry.ts`** — `personalDataMinimisers()` supplies the list of per-module minimisation hooks executed by `minimiseInactive`.
- **`src/modules/users/model.ts`** — `UserDocument` type used throughout for the account shape.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` records each failed minimisation inside `minimiseInactiveBefore`.
- **`src/modules/users/services/index.ts`** — Barrel file that re-exports this module's public API.

## Notes

- Staff/admin exclusion is a **hard invariant** enforced in every stage via `customersOnly`; no caller can bypass it.
- `minimiseInactive` is intentionally all-or-nothing per account: if any hook throws, the minimised stamp is **not** written, so the account is picked up again on the next run.
- `minimiseInactiveBefore` is fault-tolerant across accounts: one failure increments `failed` and moves on; it never aborts the remaining candidates.
