---
source: src/modules/account/session/family-liveness.ts
sha256: 07f7d0a0335f71c49677171e4fca9290cee5bc398fc959bcc73c128e8e709069
generated_at: 2026-11-08T04:28:06.447884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/family-liveness.ts

## Purpose

Determines whether a session **family** is still valid: it must have a live row in the repository, and (for staff roles) it must not have idled out or exceeded the staff lifetime cap. This logic is shared by the JWT bearer path (which names its family via the `sid` claim) and by SSE stream rechecks (which follow the family across credential rotation). If the family is dead, the session is revoked on the spot.

## Key elements

- **`ACTIVITY_STAMP_INTERVAL_MS`** (constant) – Minimum interval (1 minute) before a busy session writes a new activity stamp. Sourced from `MINUTE_MS`.
- **`resolveInLiveFamily`** (exported function) – Core resolver. Given a user ID, family ID, session mode, a `resolveCaller` thunk, and optional `ResolveOptions`:
  - Fetches the family's activity row and resolves the caller **in parallel** (`Promise.all`).
  - Returns `{ miss: 'revoked' }` if no live row exists.
  - Revokes the family (`removeFamily`) and returns `{ miss: 'idle' }` or `{ miss: 'expired' }` if the idle/lifetime predicates fire.
  - Otherwise, opportunistically stamps activity (fire-and-forget) and returns `{ ok }`.
  - When `options.passive` is true, the request is judged but **never** counted as activity (no stamp written).

## Relationships

- **`src/modules/account/repository.ts`** – Calls `sessionRepository.familyActivity`, `removeFamily`, and `touchFamily` for all row-level operations.
- **`src/modules/account/session/idle.ts`** – Imports `hasIdledOut` and `hasOutlivedStaffCap` predicates to decide whether to revoke.
- **`src/domain-primitives/time.ts`** – Imports `MINUTE_MS` to set the activity-stamp interval.
- **`src/kernel/authentication.ts`** – Imports the `Resolution<T>` type used as the return shape.
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** – Imports `AuthContext` and `ResolveOptions` types.
- **`src/modules/account/session-mode.ts`** – Imports the `SessionMode` type (carried as a parameter).
- **`src/modules/account/session/jwt.ts`** – Downstream consumer; the JWT bearer path invokes `resolveInLiveFamily` per request.
- **`src/modules/account/tests/unit/family-liveness.test.ts`** – Unit tests for the module.

## Notes

- The activity stamp is intentionally **fire-and-forget** (`void …catch(() => false)`); a lost write only costs a stale reading on the next tick, never a failed request.
- The idle and lifetime-cap checks are **role-conditional**: they only fire when `resolveCaller` produced a truthy `ok` (i.e., the caller actually has roles). A missing caller short-circuits to a simple `ok` or `miss` without touching the idle logic.
- `passive` rechecks (e.g., SSE heartbeat) go through the same judgment path but skip the stamp write, so they don't artificially extend the idle window.
