---
source: src/modules/account/session/listing.ts
sha256: f300a1a587394d04179192d01bf37951d83b0b4650b0754de4a2847430ab6c29
generated_at: 2026-10-29T02:49:34.345076+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/listing.ts

## Purpose

Provides the "list my sessions" read path shared by both session modes (cookie and JWT). It fetches the caller's live session rows, filters out rows that are no longer valid (pre-epoch, idled, or past the staff lifetime cap), deduplicates JWT token-family rows, marks the caller's current session, and shapes the result into the wire `Session` list.

## Key elements

- **`newestPerFamily(rows)`** — Deduplicates rows by `familyId`, keeping only the newest row per family. Necessary because a JWT grace window can leave two live rows for one token family; listing both would show one sign-in twice. Relies on `_id` being time-ordered (string comparison suffices).
- **`endsAt(row, roles)`** — (private) Returns the earlier of the row's `expiresAt` and the staff lifetime cap derived from `startedAt` + roles.
- **`listSessions(mode, userId, credential)`** — Main entry point. Fetches live rows, the user record, and the caller's roles in parallel. Filters rows by epoch, idle, and staff cap. Identifies the current session by hashing `credential` and matching against `tokenHash`. Returns `Session[]` via `presentSession`.

## Relationships

- **`../repository.ts`** — Calls `sessionRepository.listLive()` to fetch live rows for the given user and mode; imports the `SessionRow` type.
- **`../domain/epoch.ts`** — Uses `predatesSessionEpoch()` to exclude rows stamped before a ban-epoch (`user.tokensValidAfter`).
- **`./idle.ts`** — Uses `hasIdledOut`, `hasOutlivedStaffCap`, and `staffCapEndsAt` to filter and compute effective end times.
- **`../presenter.ts`** — Calls `presentSession()` to shape each surviving row into the wire `Session` object.
- **`../session-mode.ts`** — Imports the `SessionMode` type used as the `mode` parameter.
- **`@infrastructure/security/hash-token`** — Hashes the caller's credential to match against stored `tokenHash` and mark `current: true`.
- **`@modules/users`** — Calls `userService.findAuthenticatableById()` to retrieve `tokensValidAfter` for epoch filtering.
- **`@modules/access`** — Calls `accessService.rolesOf()` to obtain the caller's roles (needed for idle/cap logic).
- **`@kernel/access/tenant`** — Supplies `DEPLOYMENT_TENANT_ID` for the role query.
- **`./cookie-strategy.ts` / `./jwt-strategy.ts`** — Both session strategies share this listing; they differ only in which rows are theirs and how a request identifies its own session.
- **`./tests/unit/session-listing.test.ts`** — Unit tests for `newestPerFamily` and `listSessions`.

## Notes

- **Lazy invalidation:** Idled-out and staff-capped sessions are removed only when this endpoint (or a presenting request) next evaluates them; no background job deletes the rows.
- **Legacy rows:** A row with `authTime === undefined` is always kept — it predates the epoch field and has no epoch to judge against.
- **Current-session marking is credential-based, not ID-based:** A caller authenticating via an API key or bare access token (no credential string) will have every row marked `current: false`, even if one of them is "theirs."
- **Ordering guarantee:** `newestPerFamily` preserves the input order (newest sign-in first) while collapsing duplicates; it does not re-sort.
