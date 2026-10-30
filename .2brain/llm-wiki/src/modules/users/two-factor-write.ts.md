---
source: src/modules/users/two-factor-write.ts
sha256: 79872ac01d67e6fd0408d2cdce912fcbb54ebbad7d7e22b23284bd1518ec2b6b
generated_at: 2026-10-29T06:24:34.849789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/two-factor-write.ts

## Purpose

Models a two-factor-authentication write as an explicit, per-field diff plan (`TwoFactorWrite`) and the MongoDB aggregation pipeline that applies it as a single atomic `updateOne`. It replaces a naive whole-array `$set` that would replay stale TOTP steps (RFC 6238 §5.2) and cause version-conflict failures when two requests touch different methods.

## Key elements

- **`ENTRY_FIELDS`** – const tuple listing every per-entry field a write may carry (except `_id`, `method`).
- **`EntryChange`** – one existing entry's diff: its `_id`, fields to `$set`, fields to `$unset`.
- **`TwoFactorWrite`** – the full plan: `changed`, `added`, `dropped` (method names or `'all'`), account-level `set`/`unset`, `discardCodesIfDisarmed`, optional `mintCodes`.
- **`MintedBackupCodes`** – `{ salt, digests }` for a first set of backup codes.
- **`TwoFactorWriteOutcome`** – values read back in the same atomic step (`enabledAt`, `backupCodeSalt`, `backupCodeCount`).
- **`TwoFactorWriteOptions`** – caller-supplied extras: `dropped`, `discardCodesIfDisarmed`, `mintCodes`.
- **`planTwoFactorWrite(user, options?)`** – diffs the loaded `UserDocument` into a `TwoFactorWrite`; partitions entries into added / changed / dropped and collects account-level modifications.
- **`markEntryWritten(entry)`** – clears `directModifiedPaths` on a single subdocument so a subsequent plan won't re-send those fields.
- **`settleTwoFactorWrite(user)`** – after a write lands, unmarks all modified paths and resets `$isNew` on every entry so the copy is clean for the next plan.
- **`isEmptyWrite(write)`** – true when the plan would change nothing.
- **`patched` / `methodsAfter`** (internal) – build the aggregation-pipeline fragments (`$mergeObjects`, `$unsetField`, `$filter`, `$map`, `$switch`) that the repository feeds into the atomic update.

## Relationships

- **`src/modules/users/model.ts`** – source of the `UserDocument` and `TwoFactorMethodRecord` types used throughout this file.
- **`src/modules/users/repository.ts`** – consumes the `TwoFactorWrite` plan (and the pipeline fragments) to execute the single atomic `updateOne` and return a `TwoFactorWriteOutcome`.
- **`src/modules/users/services/credentials.ts`** – calls `planTwoFactorWrite` to build the plan and `settleTwoFactorWrite` to mark the loaded copy as written after the repository confirms.

## Notes

- `lastUsedStep` appears in `ENTRY_FIELDS` but is **only ever `$unset`** by this module; assigning a step is `claimTotpStep`'s sole responsibility.
- `twoFactorEnabledAt` and `authenticatorEnabledAt` are in `DERIVED_PATHS` and are **excluded** from account-level `set`/`unset`; they are computed in-database from the method array at write time.
- Mongoose subdocument internals (`$isNew`, `directModifiedPaths`, `unmarkModified`) are accessed via `Reflect` because the TypeScript type is the plain record, not the hydrated subdocument.
- The pipeline uses `$unsetField`, which requires **MongoDB ≥ 5.0**.
- `mintCodes` is conditional in-database: stored only if the account has no backup codes at the moment the write lands. `discardCodesIfDisarmed` is likewise a conditional instruction, not a direct `$unset`.
- `literal()` wraps values that begin with `$` so the aggregation engine treats them as constants, not field paths.
