---
source: src/modules/account/session/idle.ts
sha256: dde4333d72e0b6d25ee3345ff61c3d3cbba21714d4e48931dac38a442b0a80d2
generated_at: 2026-10-15T10:07:02.354487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/idle.ts

## Purpose

Implements the backend-enforced idle timeout for staff and admin sessions. A session that has not seen a real request within the configured window is considered idled out. Shopper sessions are never idled (NIST AAL1 "MAY"). Lives in the backend so the policy cannot be bypassed by a client timer.

## Key elements

- **`idleLimitMilliseconds(roles)`** — Returns the idle limit in milliseconds for a given role set. Returns `0` for the `'user'` level (shoppers) or when the timeout is disabled; otherwise returns `getStaffIdleTimeSeconds() * 1000`.
- **`hasIdledOut(lastActive, roles, now?)`** — Boolean check: `true` when the elapsed time since `lastActive` exceeds the limit for this caller. `now` defaults to `new Date()` but is injectable for testing.

## Relationships

- **`src/kernel/permissions.ts`** — Provides `levelOfRoles`, used to distinguish staff/admin from the `'user'` (shopper) tier and decide whether the idle limit applies at all.
- **`src/modules/account/session/config.ts`** — Provides `getStaffIdleTimeSeconds`, the single source of truth for the configured timeout duration.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — Source of the `AuthContext` type; the `roles` field is the sole input shape consumed by both exports.
- **`src/modules/account/controllers/post-session-touch.ts`** — Consumes `hasIdledOut` (or `idleLimitMilliseconds`) to decide whether to terminate a session during a touch/keep-alive request.
- **`src/modules/account/session/listing.ts`** — Likely consults idle status when presenting or filtering active sessions.
- **`src/modules/account/session/cookie-strategy.ts` / `family-liveness.ts`** — Adjacent session-lifecycle modules that may reference the idle boundary when deciding cookie renewal or family-group liveness.

## Notes

- The module is intentionally side-effect-free and pure: both exports are plain functions with no I/O, making them trivially testable.
- `hasIdledOut` accepts an optional `now` parameter — always pass one in tests to avoid non-deterministic date comparisons.
- A return value of `0` from `idleLimitMilliseconds` means "no limit," not "immediate expiry." `hasIdledOut` guards against this with `limit > 0 && …`.
- The design rationale (staff-only, backend-enforced, NIST reference) is documented in the module JSDoc and in `docs/theory/sessions.md#the-staff-idle-timeout`.
