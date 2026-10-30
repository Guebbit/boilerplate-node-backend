---
source: src/modules/users/services/audit-changes.ts
sha256: d48c54c857adac371187011b1414f828739e71e877b12680e54734728ef43a1e
generated_at: 2026-10-29T06:15:32.467072+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/audit-changes.ts

## Purpose

Computes the field-level diff produced by a user account edit (admin or owner) into audit-row metadata, applying a privacy rule: identifying fields are logged by name only, preference fields by value. This exists because the audit collection is append-only and never scrubbed on erasure, so what is recorded must be chosen deliberately.

## Key elements

- **`UserAuditedKey`** — union of the seven auditable field names (`username`, `email`, `phone`, `website`, `imageUrl`, `locale`, `analyticsConsent`).
- **`USER_AUDITED_FIELDS`** — the privacy classification: `valued` (locale, analyticsConsent) vs `named` (the five identifying fields).
- **`userAuditChanges(user, data)`** *(exported)* — diffs the current document against the incoming change-set and returns an `AuditChanges` object (or `{}` if nothing audited moved). Wraps the generic `auditChanges` from the observability layer.

## Relationships

- **`src/infrastructure/observability/audit-changes.ts`** — provides the generic `auditChanges` function and the `AuditChanges` / `AuditedFields` types this module configures and calls.
- **`src/modules/users/model.ts`** — supplies the `UserDocument` type for the first argument.
- **`src/modules/users/services/update.ts`** — consumes `userAuditChanges` to build the audit row before applying the edit.
- **`src/modules/users/services/index.ts`** — re-exports `userAuditChanges` for external import.

## Notes

- **Call before mutation.** The document is updated in place by the caller; passing an already-mutated document would produce a no-op diff.
- **Phone is compared by presence, not value.** It is stored encrypted with a random IV, so two equal numbers never compare equal. Sending a number always counts as a change; clearing an already-unset phone does not. The diff sentinel is `'<set>'` vs `undefined`.
- **Absent key ≠ clear.** In the `data` parameter, omitting a key leaves the field untouched; passing `null` explicitly clears it.
- **Privacy is baked in here, not downstream.** Downstream code cannot reclassify a field; the `named`/`valued` split is fixed in `USER_AUDITED_FIELDS`.
