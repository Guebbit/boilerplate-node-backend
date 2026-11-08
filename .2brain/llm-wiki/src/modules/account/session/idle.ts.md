---
source: src/modules/account/session/idle.ts
sha256: 2a1fbae6a5f9fdb3ba1db126bb435368295375f91f38ec9e4a27bf58041b1e6a
generated_at: 2026-11-08T04:28:19.707619+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/idle.ts

## Purpose

Backend enforcement of the staff-only session idle timeout and lifetime cap. A session whose holder (tenant or platform role) has not made a real request within the configured window is considered idled out; a session that outlives its absolute lifetime is expired. Shopper sessions are never subject to either check. Enforced server-side because a client timer is treated as advisory only.

## Key elements

- **`isStaff(roles)`** *(internal)* — returns `true` if `roles.tenant` or `roles.platform` is non-null.
- **`idleLimitMilliseconds(roles)`** *(exported)* — the idle window in ms for the given caller, or `0` when the cap doesn't apply (non-staff or timeout disabled).
- **`hasIdledOut(lastActive, roles, now?)`** *(exported)* — `true` when the elapsed time since `lastActive` exceeds the idle limit.
- **`staffCapEndsAt(startedAt, roles)`** *(exported)* — the absolute `Date` at which a staff session must end (sign-in time + lifetime cap), or `undefined` when the cap doesn't apply.
- **`hasOutlivedStaffCap(startedAt, roles, now?)`** *(exported)* — `true` when `now` is past `staffCapEndsAt`.

## Relationships

- **`./config`** — imports `getStaffIdleTimeSeconds` and `getStaffLifetimeSeconds` to obtain the configured thresholds.
- **`@types` → `src/types/auth-context.ts` / `src/types/index.ts`** — imports the `AuthContext` type solely for the `roles` shape used in every public function signature.
- The exported predicates (`hasIdledOut`, `hasOutlivedStaffCap`) are the check points consumed by the other session files in this directory (`listing.ts`, `account-view.ts`, `cookie-strategy.ts`, `family-liveness.ts`) when deciding whether to terminate or deny a request.

## Notes

- "Staff" is defined by the presence of **either** a tenant or a platform role; a pure shopper (`tenant: null, platform: null`) gets `0` back from `idleLimitMilliseconds` and `undefined` from `staffCapEndsAt`, short-circuiting both checks.
- `staffCapEndsAt` is intentionally stateless and reads the cap on every call, so a shopper promoted to a staff role mid-session is capped starting from the next request (the session family's `startedAt` does not reset on promotion).
- All time comparisons use `Date.getTime()` (ms precision); the config values arrive in **seconds** and are multiplied by 1000 inside this module.
- The `now` parameter defaults to `new Date()`, making the functions deterministic in tests when a timestamp is supplied.
