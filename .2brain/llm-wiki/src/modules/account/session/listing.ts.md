---
source: src/modules/account/session/listing.ts
sha256: f300a1a587394d04179192d01bf37951d83b0b4650b0754de4a2847430ab6c29
generated_at: 2026-11-08T04:29:22.517675+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/listing.ts

## Purpose

Lists an account's live sessions for a given `SessionMode`, deduplicating JWT token families, filtering out sessions that are effectively dead (predating a ban epoch, idled out, or past the staff lifetime cap), marking the caller's current session, and shaping rows into the wire `Session` type. Shared by both session modes (cookie and JWT); the modes differ only in which rows they select and how they identify "current."

## Key elements

- **`newestPerFamily(rows)`** (exported) — Given live `SessionRow`s ordered newest-first, keeps only the newest row per `familyId` (compared by `_id` string order, which is time-ordered). Prevents a single JWT sign-in from appearing twice when two refreshes land inside the grace window.
- **`endsAt(row, roles)`** (module-private) — Returns the effective end of a session: the minimum of the row's `expiresAt` and the staff lifetime cap (if applicable for the caller's roles).
- **`listSessions(mode, userId, credential)`** (exported) — The main entry point. Fetches live rows, the user (for `tokensValidAfter`), and roles in parallel, then:
  1. Filters out rows that predate a session epoch (ban), are idled out, or have outlived the staff cap.
  2. Digs the credential via `hashToken` to build a `Set` of "current" family IDs.
  3. Deduplicates via `newestPerFamily`.
  4. Maps each surviving row through `presentSession` with its computed `endsAt` and current flag.

## Relationships

- **`session/idle.ts`** — Source of `hasIdledOut`, `hasOutlivedStaffCap`, and `staffCapEndsAt`, used for filtering and end-date calculation.
- **`domain/epoch.ts`** — `predatesSessionEpoch` determines whether a row was stamped before a ban moved the account's token-validity epoch.
- **`presenter.ts`** — `presentSession` converts a `SessionRow` into the wire `Session` shape.
- **`repository.ts`** — `sessionRepository.listLive` provides the raw live rows for the given mode.
- **`infrastructure/security/hash-token.ts`** — `hashToken` digests the caller's credential so it can be compared against stored `tokenHash` values to mark the current session.
- **`kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes the role lookup.
- **`modules/users/index.ts` / `services/index.ts`** — `userService.findAuthenticatableById` retrieves `tokensValidAfter` for epoch checking.
- **`modules/access/index.ts` / `services/index.ts`** — `accessService.rolesOf` supplies the caller's roles (needed for idle/staff-cap logic).
- **`session-mode.ts`** — Defines the `SessionMode` type that parameterises which rows belong to the caller.
- **`tests/unit/session-listing.test.ts`** — Unit tests for `newestPerFamily` and `listSessions`.

## Notes

- `newestPerFamily` compares `_id` as **strings** (`String(row._id) > String(kept._id)`), relying on ObjectId's lexicographic order matching chronological order. This is an intentional shortcut, not a bug.
- A session that is idled out or past the staff cap is **not** deleted from the DB here; it is only hidden from the listing. The row is only truly ended when the user next presents it (see `idle.ts`).
- `credential` being `undefined` means the caller authenticated via a key or bare access token; in that case no row is marked `current`. This is by design, not an error state.
- The `authTime === undefined` guard handles legacy rows written before the `authTime` field existed — they are always kept (no epoch to judge).
