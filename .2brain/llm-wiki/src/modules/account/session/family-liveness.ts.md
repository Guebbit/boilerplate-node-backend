---
source: src/modules/account/session/family-liveness.ts
sha256: 57ad9f824dc2a36139d93d7121166c409d634084b7a86352b46f07bef758dac5
generated_at: 2026-10-29T02:48:29.980521+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/family-liveness.ts

## Purpose

Determines whether a session **family** is still valid: it must have a live row in the repository, and—when the caller is staff—must not have idled out or exceeded the staff lifetime cap. If the family has lapsed, it is revoked. Otherwise, the request is counted as activity (throttled to one stamp per minute). This logic is shared by JWT bearer resolution (an access token names its family via `sid`) and by SSE stream rechecks, which must follow the family across credential rotations.

## Key elements

- **`ACTIVITY_STAMP_INTERVAL_MS`** (const, 60 000 ms) – minimum interval between activity-stamp writes for a busy family.
- **`resolveInLiveFamily(userId, familyId, mode, resolveCaller, options?)`** (exported function) – the sole public API. Runs the family-activity read and the caller proof in parallel, then:
  - Returns `{ miss: 'revoked' }` if no live row exists.
  - Returns `{ miss: 'idle' }` (after revoking the family) if `hasIdledOut` fires.
  - Returns `{ miss: 'expired' }` (after revoking the family) if `hasOutlivedStaffCap` fires.
  - Otherwise returns `{ ok }` and fires a fire-and-forget `touchFamily` stamp when the last stamp is older than the interval.
  - Respects `options.passive`: passive requests are judged but never stamped as activity.

## Relationships

- **`src/modules/account/repository.ts`** – calls `sessionRepository.familyActivity`, `.removeFamily`, and `.touchFamily` to read, revoke, and stamp the family row.
- **`src/modules/account/session/idle.ts`** – imports `hasIdledOut` and `hasOutlivedStaffCap` to make the idle/cap decisions.
- **`src/modules/account/session-mode.ts`** – imports the `SessionMode` type; the mode is minted at family creation and passed through to the repository.
- **`src/kernel/authentication.ts`** – imports the `Resolution<T>` return-type wrapper.
- **`src/types/index.ts` / `src/types/auth-context.ts`** – imports `AuthContext` and `ResolveOptions` types.
- **`src/modules/account/session/jwt.ts`** – listed in the module doc as a consumer (bearer-token path names the family via `sid`).
- **`src/modules/account/tests/unit/family-liveness.test.ts`** – unit-tests this module.

## Notes

- Activity stamping is deliberately **fire-and-forget** (`void … .catch(() => false)`). A lost stamp costs only a stale reading on the next request; it never blocks the response.
- `resolveCaller` is a **thunk**, not a pre-resolved value, so the JWT proof and the family-row read execute concurrently via `Promise.all`.
- The `passive` option is the mechanism that lets SSE rechecks (and other read-only probes) verify liveness without perturbing the idle clock.
- Revocation on idle/expiry is **eager** (the family row is deleted before returning the miss), so a subsequent request will see `{ miss: 'revoked' }` rather than re-evaluating the idle predicate.
