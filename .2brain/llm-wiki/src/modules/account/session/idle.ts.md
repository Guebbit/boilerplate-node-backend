---
source: src/modules/account/session/idle.ts
sha256: 2a1fbae6a5f9fdb3ba1db126bb435368295375f91f38ec9e4a27bf58041b1e6a
generated_at: 2026-10-29T02:48:43.666247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/idle.ts

## Purpose

Implements the **staff idle timeout** and **staff lifetime cap**: two independent backend-enforced expiry rules that apply only to callers holding a tenant or platform role. Shopper sessions are never affected. The logic lives here (rather than in a client timer) so it is authoritative.

## Key elements

- **`isStaff`** *(private)* — Returns `true` when `roles.tenant !== null` or `roles.platform !== null`. The sole gate for every rule in this file.
- **`idleLimitMilliseconds(roles)`** — Returns the idle window in ms (config seconds × 1000), or `0` when the rule does not apply.
- **`hasIdledOut(lastActive, roles, now?)`** — Pure check: is the gap between `lastActive` and `now` greater than the idle limit? Returns `false` for non-staff or when the timeout is disabled.
- **`staffCapEndsAt(startedAt, roles)`** — Computes the absolute `Date` at which a session family's lifetime cap expires, or `undefined` if the cap doesn't apply. Read per-request so a mid-session role promotion is honoured from the next request.
- **`hasOutlivedStaffCap(startedAt, roles, now?)`** — Boolean wrapper around `staffCapEndsAt`: has `now` passed the cap?

## Relationships

- **`./config`** (`session/config.ts`) — Source of the two tunable values: `getStaffIdleTimeSeconds()` and `getStaffLifetimeSeconds()`. A `0` return from either effectively disables that rule.
- **`@types`** (`types/auth-context.ts`, `types/index.ts`) — Imports the `AuthContext` type, whose `roles` shape (`tenant`, `platform`) defines what "staff" means here.
- **`session/family-liveness.ts`** — The `startedAt` parameter throughout this file refers to the session-family sign-in instant maintained by family-liveness; a token refresh does not reset it.
- **`controllers/post-session-touch.ts`** — The request-level controller that calls `hasIdledOut` / `hasOutlivedStaffCap` to decide whether to terminate a session on the next real request.

## Notes

- Two distinct expiry axes coexist: **idle** (inactivity gap) and **lifetime cap** (absolute age). A session can pass one and fail the other.
- `idleLimitMilliseconds` and `staffCapEndsAt` both return a "zero / undefined" sentinel meaning "rule does not apply" rather than throwing. Callers must treat that as "no restriction," not as an error.
- `hasIdledOut` and `hasOutlivedStaffCap` accept an injectable `now` parameter (defaults to `new Date()`) for deterministic testing.
- The module is intentionally side-effect-free: it only *computes* whether a session should end. The actual termination (cookie clearing, row deletion, etc.) is the caller's responsibility.
