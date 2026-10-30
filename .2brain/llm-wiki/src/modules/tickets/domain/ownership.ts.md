---
source: src/modules/tickets/domain/ownership.ts
sha256: 51e59af4713825d43e77cef1464547317145dad7a05a242d2d63ea0167ba8261
generated_at: 2026-10-29T06:02:44.625841+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/domain/ownership.ts

## Purpose

Defines the single, authoritative rule for determining which visitor tickets "belong" to a person. Both data-export and data-erasure paths call the same pure function, guaranteeing they always agree on the ticket set (export lists exactly what erase removes).

## Key elements

- **`OwnerRef`** – Structural interface identifying the data subject: `userId`, `email`, `emailVerified`. Mirrors the kernel's `PersonalDataSubject` shape.
- **`OwnTicketsFilter`** – The Mongo filter shape produced for a `source: 'visitor'` query. Contains an `$or` array of `{ subjectId }` and/or `{ email }` clauses.
- **`ownTicketsFilter(subject: OwnerRef): OwnTicketsFilter`** – Pure builder. Returns a filter matching:
  - all tickets whose `subjectId` equals the user's account id (regardless of sender address), **plus**
  - tickets whose `email` matches the account's address, but **only** when `emailVerified` is `true`.

## Relationships

- **`src/modules/tickets/domain/index.ts`** – Barrel file that re-exports `OwnerRef`, `OwnTicketsFilter`, and `ownTicketsFilter` so consumers import from the domain entry point.
- **`src/modules/tickets/repository.ts`** – Consumes the filter returned by `ownTicketsFilter` to run the actual Mongo find/deleteMany queries for a given data subject.

## Notes

- The `emailVerified` guard is a deliberate GDPR Art. 12(6) control: an unverified address must not be treated as the owner's, preventing a malicious user from signing up with someone else's email, deleting the account, and wiping/exporting that person's tickets.
- System tickets (`source !== 'visitor'`) are **out of scope** here; they are governed by a separate rule keyed on `subjectId`. Do not expect this filter to cover them.
- The function is pure and side-effect-free—no DB calls, no side effects—so it is trivially testable and safe to share across export/erasure code paths.
