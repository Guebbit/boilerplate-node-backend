---
source: src/modules/account/session/idle.ts
source_sha256: 21464e7f17e1a627a56a71d9029a6637a27c460f77964309b0c0dd9e54ac6d80
context_sha256: 6819aa9ce960e530bcceadaf7c7909ad5a41874d631d2140049c76862f1b62f4
generated_at: 2026-11-22T03:46:50.282428+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/idle.ts

## Purpose
Backend enforcement of two staff-only session limits: an idle timeout (no real request for too long) and an absolute lifetime cap since sign-in. Shoppers (callers with no tenant or platform role) are never limited. It lives server-side because a client timer is only a courtesy. The file holds pure time and role checks, not session storage or request handling.

## Key elements
- `isStaff` (private): true when `roles.tenant` or `roles.platform` is non-null.
- `idleLimitMilliseconds(roles)`: the idle limit in ms, from `getStaffIdleTimeSeconds() * 1000` for staff. It returns `0` for non-staff or when the timeout is off.
- `hasIdledOut(lastActive, roles, now = new Date())`: true only if a limit applies and `now - lastActive` exceeds it.
- `staffCapEndsAt(startedAt, roles)`: `startedAt` plus `getStaffLifetimeSeconds()` for staff. It returns `undefined` for non-staff or when the cap is off.
- `hasOutlivedStaffCap(startedAt, roles, now = new Date())`: true if a cap end exists and `now` is strictly after it.

## Relationships
- `./config`: supplies `getStaffIdleTimeSeconds` and `getStaffLifetimeSeconds`, the configured limits. A value that yields `0` disables the limit.
- `@types` (`src/types/auth-context.ts`, re-exported via `src/types/index.ts`): `AuthContext['roles']` is the type of the `roles` parameter.
- `account-view.ts`, `cookie-strategy.ts`, `family-liveness.ts` and `listing.ts` are graph neighbors, but this file does not import them. The visible code does not show how they call these helpers.

## Notes
- The cap is computed from `startedAt`, the sign-in time of the session family, which a refresh keeps. It is evaluated on every request, so a customer promoted to staff mid-session is capped from their next request.
- Both checks use strict `>`, so a session exactly at the limit has not yet expired.
- A limit of `0` means "not applicable" and cannot be told apart from "off" in the return values.
