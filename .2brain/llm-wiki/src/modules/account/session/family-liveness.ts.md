---
source: src/modules/account/session/family-liveness.ts
source_sha256: 54d19a4fb206872a4f7d671f55f506558797b032a605350c428a5b254a0839c7
context_sha256: fa93ad2093336a12bf917b900bd8f35ef79a932a570ebb6ab7f5a406aad3a1f3
generated_at: 2026-11-22T03:46:39.094498+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/family-liveness.ts

## Purpose
Decides whether a session *family* is still a valid session: it must have a live row, and (for staff) must not have idled out or outlived the lifetime cap. It is shared by the `jwt` bearer path (an access token names its family in `sid`) and by an open SSE stream's recheck, which follows the family because the credential rotates underneath it. It also records activity and exposes the session clock to the caller.

## Key elements
- `resolveInLiveFamily(userId, familyId, mode, resolveCaller, options)` – the only export. Returns `Promise<Resolution<AuthContext | undefined>>`.
  - Concurrently reads `sessionRepository.familyActivity(...)` and calls `resolveCaller()`.
  - No activity row: `{ miss: 'revoked' }`.
  - Caller resolved and `hasIdledOut(...)` is true: removes the family and returns `{ miss: 'idle' }`.
  - Caller resolved and `hasOutlivedStaffCap(...)` is true: removes the family and returns `{ miss: 'expired' }`.
  - Otherwise returns `{ ok }`, where `ok` is the caller with a `sessionClock: { lastActiveAt, startedAt }` attached (or `undefined` if the caller didn't resolve).
- `ACTIVITY_STAMP_INTERVAL_MS` – private constant, equal to `MINUTE_MS`. It limits how often a busy session writes its activity stamp.

## Relationships
- `../repository` (`sessionRepository`): `familyActivity` to read, `removeFamily` to end idle or expired sessions, and `touchFamily` to write the activity stamp.
- `./idle`: supplies `hasIdledOut` and `hasOutlivedStaffCap`, which take the caller's roles.
- `@domain-primitives/time`: `MINUTE_MS`.
- `@kernel/authentication`: the `Resolution` type.
- `@types`: the `AuthContext` and `ResolveOptions` types.
- `../session-mode`: the `SessionMode` type.
- The `jwt` strategy files and the unit test `family-liveness.test.ts` are its neighbours in the graph. The header comment says the `jwt` bearer uses this function.

## Notes
- The idle and cap checks run only when the caller resolved (`ok` is truthy). A missing row is a miss regardless.
- `options.passive` requests are judged but never write a stamp.
- A stamp is written only when none exists yet or the last one is at least one minute old. The write is fire-and-forget via `touchFamily`, and errors are swallowed (`.catch(() => false)`). A lost stamp costs only a stale reading.
- `sessionClock.lastActiveAt` is `now` only when this request writes a stamp. Otherwise it is the stored value, so the countdown never promises more time than the server will grant.
