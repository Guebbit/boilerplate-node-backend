---
source: src/modules/tasks/domain/ownership.ts
source_sha256: 943999b9f1e481384a325af4ec341c193e7aa959788cf75bf0d1980f946d166b
context_sha256: 90e6f3205d4e6121974f6a9625114c07983c5bc68eb463889ba19cdf49b8ac18
generated_at: 2026-11-22T07:59:44.602002+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/domain/ownership.ts

## Purpose
Defines the single rule for which tasks belong to a person. Both the data export and the erasure use it. The module is pure, so the two operations always agree on the set: export lists exactly what erase removes.

## Key elements
- `OwnerRef`: interface with `userId`, `email` and `emailVerified`. It identifies who an export or erasure is about, and is structurally the kernel's `PersonalDataSubject`.
- `OwnTasksFilter`: interface for a Mongo filter. It has `source: 'visitor'` and an `$or` list of `{ subjectId }` or `{ email }` clauses.
- `ownTasksFilter(subject)`: builds the filter.
  - It always matches visitor tasks whose `subjectId` equals `userId`.
  - It adds an `{ email }` clause only when `emailVerified` is true.

## Relationships
- `src/modules/tasks/domain/index.ts` is a sibling in the same domain folder. This file doesn't import anything, so the relationship is likely a re-export.
- `src/modules/tasks/repository.ts` is the likely consumer of the filter, since it queries tasks. The filter is a Mongo query shape, so the repository would pass it to a query. Neither relationship is visible in this file.

## Notes
- The filter only covers `source: 'visitor'` tasks. System tasks are about a record, not a sender, and follow `subjectId` through their own rule.
- The email clause is gated on `emailVerified` as an anti-abuse measure. Anyone could sign up with a stranger's address, then delete the account to wipe that stranger's messages, or export them. The code comment cites GDPR Art. 12(6): verify identity before disclosing.
- An unverified account therefore matches only tasks sent while signed in. This holds whatever address was typed on those tasks.
