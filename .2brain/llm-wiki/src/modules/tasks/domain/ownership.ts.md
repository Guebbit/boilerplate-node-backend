---
source: src/modules/tasks/domain/ownership.ts
sha256: 943999b9f1e481384a325af4ec341c193e7aa959788cf75bf0d1980f946d166b
generated_at: 2026-11-08T08:33:29.065011+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/domain/ownership.ts

## Purpose

Defines the single ownership rule that determines which visitor tasks belong to a given person. It exists as a pure, shared definition so that data export and data erasure always agree on the exact set of tasks, eliminating any risk of the two operations diverging.

## Key elements

- **`OwnerRef`** – Interface identifying the subject of an export or erasure (`userId`, `email`, `emailVerified`). Structurally matches the kernel's `PersonalDataSubject`.
- **`OwnTasksFilter`** – Shape of the Mongo filter over visitor tasks: constrains `source` to `'visitor'` and provides an `$or` array of either `{ subjectId }` or `{ email }` predicates.
- **`ownTasksFilter(subject)`** – Pure function that builds an `OwnTasksFilter`. Always includes a `subjectId` match on `userId`; includes an `email` match only when `emailVerified` is `true`.

## Relationships

- **`src/modules/tasks/domain/index.ts`** – Barrel file for the task domain; re-exports the interfaces and `ownTasksFilter` so consumers can import from the domain root.
- **`src/modules/tasks/repository.ts`** – Consumes `ownTasksFilter` (and the `OwnTasksFilter` type) to build the actual database queries for listing, exporting, or deleting a person's tasks.

## Notes

- **Email gating:** The `email` predicate is included in the `$or` array *only* when `emailVerified` is `true`. This enforces GDPR Art. 12(6): a stranger who signed up with someone else's address, then deleted their account, cannot export or erase that person's messages.
- **Visitor tasks only:** The filter hard-codes `source: 'visitor'`. System tasks (which reference a record, not a sender) are governed by a separate rule outside this file.
- **Pure by design:** No side effects, no I/O. The same input always yields the same filter, guaranteeing export and erasure operate on identical sets.
