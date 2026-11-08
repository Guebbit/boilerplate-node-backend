---
source: src/modules/users/services/reaper.ts
sha256: 2109ec1e01a170e4b2d29b852ccc376dcf6b34cb6a368bb02396de228b1a048c
generated_at: 2026-11-08T08:51:17.276206+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/reaper.ts

## Purpose

Read and write helpers for the inactivity reaper — the background process that progressively takes dormant customer accounts offline through four stages (warn → soft-delete → hard-delete → personal-data minimise). Each exported function corresponds to one stage's candidate selection or execution, and every path excludes staff and administrator accounts.

## Key elements

- **`customersOnly`** *(internal)* — Filters a batch of `UserDocument`s down to non-staff accounts by querying `accessService.staffHoldersAmong`. Applied to every read before results are returned.
- **`findInactiveUnwarned(cutoff)`** — Stage 1: inactive accounts not yet warned.
- **`findWarnedStillInactive(warnedBefore)`** — Stage 2: previously warned accounts still inactive (soft-delete candidates).
- **`findReaperSoftDeletedPastGrace(cutoff)`** — Stage 3: soft-deleted accounts past their own grace window (hard-delete candidates).
- **`findInactiveUnminimised(cutoff)`** — Stage 4: inactive accounts not yet minimised for this inactivity period.
- **`minimiseInactive(user)`** — Runs every registered `personalData.minimise` hook sequentially for one account, then stamps it minimised. The stamp is written only after all hooks succeed, so a partial failure leaves the account re-selectable next run.
- **`minimiseInactiveBefore(cutoff)`** — Orchestrates stage 4: minimises all candidates one-by-one, catching per-account errors so a single failure does not halt the batch. Returns `{ minimised, failed }`.

## Relationships

- **`src/modules/users/repository.ts`** — All four `find*` reads and the `markInactivityMinimised` write go through `userRepository`.
- **`src/modules/access/index.ts`** — `accessService.staffHoldersAmong` is called inside `customersOnly` to exclude staff/admins from every stage.
- **`src/modules/users/erasure-registry.ts`** — `personalDataMinimisers()` provides the list of per-module minimise hooks executed in `minimiseInactive`.
- **`src/modules/users/model.ts`** — Supplies the `UserDocument` type used throughout.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is called when an individual minimise attempt fails inside `minimiseInactiveBefore`.
- **`src/modules/users/services/index.ts`** — Barrel re-export; consumers of the reaper import from the services index rather than this file directly.

## Notes

- Staff and administrators are structurally excluded from **every** stage via `customersOnly`; there is no stage-specific bypass. The doc comments state this is by design: an employee's account lifecycle is decided by a person, not by inactivity.
- The minimise stage is **not** atomic across accounts: one failure is logged and counted, the loop continues. But it **is** atomic per account — the minimised stamp is written only after all hooks for that account succeed, making it safely retryable.
- The four `find*` functions are pure reads (repository call + staff filter); the caller is responsible for the actual soft/hard-delete or warning writes. Only `minimiseInactive` / `minimiseInactiveBefore` perform a write (`markInactivityMinimised`).
