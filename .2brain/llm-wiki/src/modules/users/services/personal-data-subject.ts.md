---
source: src/modules/users/services/personal-data-subject.ts
sha256: 8b80dae54c4a6b88ec4bbd905f75e4d80c753e1a51e04698b1dd87f9ccf759e8
generated_at: 2026-10-29T06:17:12.293933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/personal-data-subject.ts

## Purpose

Provides a single, canonical way to derive the "subject" (identity + verification status) of the account a personal-data export or erasure targets. By funneling both the export path and the erasure cascade through this one function, every downstream `personalData` section receives the same `PersonalDataSubject` shape regardless of which operation is running.

## Key elements

- **`personalDataSubjectOf(user: UserDocument): PersonalDataSubject`** — The sole export. Reads `userId` (stringified `_id`), `email`, and `emailVerified` (derived from presence of `verifiedAt`) off a stored user document and returns a plain `PersonalDataSubject` object.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `PersonalDataSubject` type that this function returns. The contract for what downstream sections receive is defined there.
- **`src/modules/users/model.ts`** — Supplies the `UserDocument` type that this function accepts.
- **`src/modules/users/services/remove.ts`** — The erasure cascade; calls `personalDataSubjectOf` to obtain the subject it passes to each module's erasure handler.
- **`src/modules/account/services/export-job.ts`** — The export path; calls `personalDataSubjectOf` to obtain the subject it passes to each module's export handler.
- **`src/modules/users/services/index.ts`** — Barrel file that re-exports this module for external consumers.

## Notes

- `emailVerified` is a *derived* field: it is `true` only when `verifiedAt` is truthy on the document. This lets sections that match rows by email address respond only for accounts that actually proved ownership of that address, since anyone can register with a stranger's email.
- `userId` is always a string (the ObjectId is explicitly stringified), so callers can treat it as an opaque identifier.
- The function is pure — no side effects, no I/O — making it safe to call at the top of any handler without ordering concerns.
