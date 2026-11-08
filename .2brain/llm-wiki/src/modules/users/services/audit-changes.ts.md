---
source: src/modules/users/services/audit-changes.ts
sha256: d48c54c857adac371187011b1414f828739e71e877b12680e54734728ef43a1e
generated_at: 2026-11-08T08:48:39.612286+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/audit-changes.ts

## Purpose

Defines the field-level audit diff for user account edits (admin edit and owner self-edit alike). It classifies which user fields are recorded by value versus by name—a privacy decision—then delegates the actual before/after comparison to the generic infrastructure `auditChanges`.

## Key elements

- **`UserAuditedKey`** — union type of the seven request-named fields an edit may move: `username`, `email`, `phone`, `website`, `imageUrl`, `locale`, `analyticsConsent`.
- **`USER_AUDITED_FIELDS`** (internal) — `AuditedFields<UserAuditedKey>` that splits fields into `valued` (`locale`, `analyticsConsent`) and `named` (`username`, `email`, `phone`, `website`, `imageUrl`). Named fields appear in the audit row by key name only; no value is stored.
- **`userAuditChanges`** (exported) — takes the current `UserDocument` and the incoming change-set, returns an `AuditChanges` object (`{}` if nothing audited moved). Must be called *before* the document is mutated.

## Relationships

- **`src/infrastructure/observability/audit-changes.ts`** — provides the generic `auditChanges` function and the `AuditChanges` / `AuditedFields` types that this file configures and calls.
- **`src/modules/users/model.ts`** — supplies the `UserDocument` type used as the "before" state.
- **`src/modules/users/services/update.ts`** — the caller; invokes `userAuditChanges` to produce the audit-row metadata before persisting the edit.
- **`src/modules/users/services/index.ts`** — barrel re-export of `userAuditChanges`.

## Notes

- **Call order is critical.** The function reads fields off `user` directly; the update service mutates the document in place immediately after, so calling it post-mutation yields an empty diff.
- **Phone uses a presence proxy.** The value is stored encrypted with a random IV, so two equal numbers never compare equal and decrypting for the diff could fail. The "before" value is therefore `'<set>'` or `undefined`; sending any number counts as a change, clearing an already-unset one does not.
- **Audit rows are append-only and never scrubbed** on user erasure. The valued/named split is the only privacy control available at write time.
- An absent key in `data` leaves that field untouched; `null` explicitly clears it.
