---
source: src/modules/users/two-factor-write.ts
sha256: 79872ac01d67e6fd0408d2cdce912fcbb54ebbad7d7e22b23284bd1518ec2b6b
generated_at: 2026-11-08T08:59:25.046157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/two-factor-write.ts

## Purpose

Defines the **write-plan data shape** and the **diffing logic** for persisting one account's two-factor state. Instead of `$set`-ing the entire `twoFactorMethods` array (which would replay stale TOTP steps per RFC 6238 §5.2 and cause version-conflict failures between concurrent requests), this module captures only the fields a request actually changed and assembles them into a single atomic `updateOne` payload.

## Key elements

- **`ENTRY_FIELDS`** – const list of the seven mutable per-entry fields; also the closed set a write may touch.
- **`EntryChange`** – diff for one existing entry: `id`, `set` (new values), `unset` (removed fields).
- **`TwoFactorWrite`** – the full plan: `changed` entries, `added` entries, `dropped` method names (or `'all'`), account-level `set`/`unset`, `discardCodesIfDisarmed`, optional `mintCodes`.
- **`MintedBackupCodes`** – `salt` + `digests` for a first-time backup-code set; stored only if none exist yet.
- **`TwoFactorWriteOutcome`** – values read back in the same atomic step (`enabledAt`, `backupCodeSalt`, `backupCodeCount`).
- **`TwoFactorWriteOptions`** – caller-supplied additions beyond the loaded diff (`dropped`, `discardCodesIfDisarmed`, `mintCodes`).
- **`planTwoFactorWrite(user, options?)`** – *main export.* Diffs the loaded `UserDocument` into a `TwoFactorWrite` using Mongoose's `directModifiedPaths` and `$isNew`.
- **`markEntryWritten(entry)`** – unmarks a single entry's modified fields so a subsequent plan skips them.
- **`settleTwoFactorWrite(user)`** – unmarks all modified paths on the document and flips `$isNew` to `false` on every entry; call after a successful write.
- **`isEmptyWrite(write)`** – returns `true` when the plan carries no changes at all.
- **`DERIVED_PATHS`** – internal set (`twoFactorEnabledAt`, `authenticatorEnabledAt`); excluded from client-sent account changes because the DB computes them.
- **`methodsAfter`** – builds the aggregation-pipeline expression that produces the post-write `twoFactorMethods` array (filter → `$switch`/`$mergeObjects`/`$unsetField` patch → append). Requires MongoDB 5.0+ (`$unsetField`).

## Relationships

- **`src/modules/users/model.ts`** – provides the `UserDocument` and `TwoFactorMethodRecord` types that this file imports and operates on.
- **`src/modules/users/repository.ts`** – expected consumer of the `TwoFactorWrite` plan; executes the single atomic `updateOne` the pipeline describes.
- **`src/modules/users/services/credentials.ts`** – expected caller of `planTwoFactorWrite` / `settleTwoFactorWrite`; also owns `claimTotpStep`, the only place that *sets* `lastUsedStep`.

## Notes

- `lastUsedStep` appears in `ENTRY_FIELDS` but is **never set** by a write—only ever unset. Claiming a TOTP step is `claimTotpStep`'s job in the credentials service.
- Mongoose subdocument internals (`$isNew`, `directModifiedPaths`, `unmarkModified`) are accessed via `Reflect` because `TwoFactorMethodRecord` is typed as a plain record, not a hydrated subdocument.
- `accountChanges` deliberately strips `DERIVED_PATHS` from the diff; sending them from a stale copy is how the armed flag can desync from the actual factors.
- The file is a `@module` (no default export); all public API is named exports.
- The content shown is truncated; the aggregation-pipeline builder (`methodsAfter` and the final pipeline assembly) continues beyond the visible portion.
