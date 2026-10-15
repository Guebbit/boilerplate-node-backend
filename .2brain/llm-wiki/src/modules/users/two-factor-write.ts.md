---
source: src/modules/users/two-factor-write.ts
sha256: 3d1b10744dd935f95cebb7c128f2f7922f4bb21d88e191542d85c3ed3280290d
generated_at: 2026-10-15T12:17:08.708230+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/two-factor-write.ts

## Purpose

Defines the data shape (`TwoFactorWrite`) and planning logic for a single atomic 2FA state update on a user account. It exists to replace whole-array `save()`, which rewrites the entire `twoFactorMethods` array as loaded—causing stale TOTP step replay (RFC 6238 §5.2) and spurious version conflicts between concurrent requests. Instead, a request diffs its own loaded copy and emits only the fields it actually changed.

## Key elements

- **`planTwoFactorWrite(user, options)`** – Main entry point. Diffs the Mongoose `UserDocument`'s modified paths against `TwoFactorWriteOptions` and returns a `TwoFactorWrite` plan (changed entries, added entries, dropped methods, account-level set/unset, conditional backup-code instructions).
- **`settleTwoFactorWrite(user)`** – Called after the write lands; unmarks all modified paths and clears `$isNew` on subdocuments so the copy is considered current.
- **`markEntryWritten(entry)`** – Unmarks a single entry's modified fields (used when another code path already persisted that entry).
- **`isEmptyWrite(write)`** – Predicate: true when the plan carries no changes at all.
- **`TwoFactorWrite`** (interface) – The plan: `changed` (per-entry set/unset by `_id`), `added` (whole new entries), `dropped` (method names or `'all'`), `set`/`unset` (account-level), `discardCodesIfDisarmed`, `mintCodes`.
- **`TwoFactorWriteOptions`** (interface) – Caller-supplied additions beyond the loaded-copy diff: `dropped`, `discardCodesIfDisarmed`, `mintCodes`.
- **`TwoFactorWriteOutcome`** (interface) – What the atomic update leaves in the document (`enabledAt`, `backupCodeSalt`, `backupCodeCount`).
- **`MintedBackupCodes`** (interface) – A scrypt salt + digests pair for a freshly-minted backup-code set.
- **`methodsAfter(write)`** (internal) – Builds the MongoDB aggregation-expression that computes the new `twoFactorMethods` array inside the single `updateOne` (drop → patch-by-`_id` → append).
- **`ENTRY_FIELDS`** (const) – Whitelist of per-entry fields a write may touch; `lastUsedStep` is included but only ever unset.

## Relationships

- **`src/modules/users/model.ts`** – Imports `UserDocument` and `TwoFactorMethodRecord` types; all interfaces in this file reference those shapes.
- **`src/modules/users/repository.ts`** – Consumes the `TwoFactorWrite` plan (and `TwoFactorWriteOutcome`) to execute the single atomic `updateOne`; this file is the "planning" half of that pipeline.
- **`src/modules/users/services/credentials.ts`** – Calls `planTwoFactorWrite` and `settleTwoFactorWrite` around its 2FA enrollment/revocation logic; the `user` argument it passes includes credentials state.

## Notes

- **`lastUsedStep` is read-only for writes.** It appears in `ENTRY_FIELDS` but `settable()` returns `false` for it; only `claimTotpStep` (elsewhere) may set it. A write may only *unset* it.
- **Mongoose internals via `Reflect`.** `$isNew`, `directModifiedPaths`, and `unmarkModified` are accessed with `Reflect.get/apply/set` because `TwoFactorMethodRecord` is typed as a plain record while the runtime value is a hydrated subdocument.
- **`DERIVED_PATHS`** excludes `twoFactorEnabledAt` from the account-level `set`/`unset` diff; that field is derived in-database from the final array, not sent by the client.
- **Requires MongoDB 5.0+** for the `$unsetField` aggregation operator used in `patched()`.
- **`plain()`** normalises Mongoose array types to plain JS arrays before they enter the write plan, preventing driver-level type leakage into the update document.
