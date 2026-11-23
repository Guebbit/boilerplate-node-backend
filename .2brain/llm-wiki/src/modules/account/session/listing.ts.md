---
source: src/modules/account/session/listing.ts
source_sha256: 1f76256d47f5563e41880fda2d23a9a91ef2126e2445ebbbf99f73aa7bb33874
context_sha256: 8dce6442c328cf25a6c7bedee7e8f1ecb0d3203b59686f52ba4ee995a176cc50
generated_at: 2026-11-22T03:47:59.396091+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/listing.ts

## Purpose
Builds the account's live sessions as the wire's `Session` list. It is shared by both session modes (`SessionMode`), which differ only in which rows belong to them and how a request identifies its own session.

## Key elements
- **`listSessions(mode, userId, credential)`**: Returns `Promise<Session[]>` of the caller's live sessions for one mode, newest sign-in first.
  - Loads live rows, the authenticatable user and the caller's deployment-tenant roles in parallel.
  - Drops rows that no longer count as sessions (see Notes).
  - Marks `current` by hashing `credential` and matching it against `tokenHash`.
  - Collapses rows to one per family and maps each through `presentSession`.
- **`newestPerFamily(rows)`**: Exported. Keeps one row per `familyId` and preserves input order. The row with the larger `_id` wins, since `_id` is time-ordered.
- **`endsAt(row, roles)`** (private): The earlier of the row's `expiresAt` and the staff lifetime cap (`staffCapEndsAt`), if one applies.

## Relationships
- **`../repository`**: supplies the live rows via its `sessionRepository` and defines the `SessionRow` type.
- **`@modules/users/friends/account`**: supplies the authenticatable user, whose `tokensValidAfter` is used for the epoch check.
- **`@modules/access`** (and its `services`): supplies the caller's roles for the deployment tenant. The tenant id comes from `@kernel/access/tenant`.
- **`../domain/epoch`**: `predatesSessionEpoch` checks a row's `authTime` against the user's epoch.
- **`./idle`**: `hasIdledOut`, `hasOutlivedStaffCap` and `staffCapEndsAt` apply the staff idle and lifetime limits.
- **`@infrastructure/security/hash-token`**: `hashToken` digests the caller's credential for comparison.
- **`../presenter`**: `presentSession` shapes each row into the wire `Session`.
- **`../session-mode`**: provides the `SessionMode` type.
- **`@types`**: provides `AuthContext` (for `roles`) and `Session`.
- **`src/modules/account/tests/unit/session-listing.test.ts`**: the unit test for this file.

## Notes
- A `jwt` family can hold two live rows at once, because two refreshes inside the grace window each mint a successor. `newestPerFamily` stops one sign-in from being listed twice under one id.
- Rows are excluded if any of these holds:
  - The user's session epoch (`tokensValidAfter`) is later than the row's `authTime`. A ban moves the epoch without deleting rows. Rows with no `authTime` are never excluded on this basis.
  - The staff idle limit has been exceeded. Idle time is measured from `lastUsedAt`, falling back to `startedAt`.
  - The staff lifetime cap has been exceeded.
- Idle and cap expiry are otherwise only enforced when someone presents the session, so without this filter such rows would still be listed.
- A caller with no credential (for example an API key or a bare access token) gets every row with `current: false`.
- `current` is computed on the filtered rows before family collapsing. A match on any row in a family marks the whole family as current.
- The endpoint only lists the authenticated caller's own sessions, and rows of the other mode are never shown.
