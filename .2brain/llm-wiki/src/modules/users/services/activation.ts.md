---
source: src/modules/users/services/activation.ts
sha256: 95f038c23abe748fbc5fe396a1ef1686ee20624c0689d2acf87e3e853898bd37
generated_at: 2026-11-08T08:48:30.215508+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/activation.ts

## Purpose

Implements the two account-state toggles — `activate` and `deactivate` — for the users module. Deactivation is modeled as a ban: it ends every session the account holds within the same database transaction that persists the flag change and publishes the `user.deactivated` outbox event. Both operations are idempotency-guarded (409 on repeat) and authorization-guarded (403 for protected roles).

## Key elements

- **`activate(id, context)`** *(exported)* — Sets `user.active = true`, persists via `userRepository.save`, records an `ADMIN_USER_UNBANNED` audit entry. Returns 409 `USER_ALREADY_ACTIVE` if already active. Does **not** touch sessions; the owner is expected to sign in fresh.
- **`deactivate(id, context)`** *(exported)* — Sets `user.active = false`, calls `markSessionsEnded(user)`, then within a single `withTransaction` both saves the user and enqueues a `USER_DEACTIVATED` outbox message via `announceWithin`. After commit: nudges the outbox relay, records `ADMIN_USER_BANNED` audit, and emits a `USER_DEACTIVATED` analytics event. Returns 409 `USER_ALREADY_INACTIVE` if already deactivated.
- **`withClearedAccount(id, context, next)`** *(module-private)* — Shared guard: loads the user (404 if missing), then checks `accessService.roleProtectedRefusal`; if no refusal, delegates to the `next` callback with the loaded `UserDocument`.

## Relationships

- **`@infrastructure/http/response`** — Source of `generateSuccess` / `generateReject` helpers and the `ResponseSuccess` / `ResponseReject` union type used in every return path.
- **`@infrastructure/i18n`** (`index.ts`) — `t()` provides localized error messages (`users.not-found`, `users.already-active`, `users.already-inactive`).
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the save + outbox-announce pair in `deactivate` so both commit atomically.
- **`@kernel/outbox`** — `announceWithin` writes the domain event into the outbox table inside the transaction; `nudgeOutbox` kicks the relay *after* commit.
- **`@infrastructure/observability/audit`** — `recordAudit` logs `ADMIN_USER_UNBANNED` / `ADMIN_USER_BANNED` with outcome and target.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` fire the churn-relevant `USER_DEACTIVATED` product event (deactivate only).
- **`@modules/access`** (index → `services/index.ts`) — `accessService.roleProtectedRefusal` gates both operations against role-protection rules.
- **`../repository`** — `userRepository.findById` / `save` for all persistence.
- **`../model`** — `UserDocument` type (the `active?: boolean` field is central to both operations).
- **`../analytics`** — `usersAnalyticsEvents.USER_DEACTIVATED` enum value.
- **`../audit`** — `usersAuditActions.ADMIN_USER_BANNED` / `ADMIN_USER_UNBANNED` enum values.
- **`../events`** — `USER_DEACTIVATED` event name used in the outbox announcement.
- **`./credentials`** — `markSessionsEnded` invalidates all session tokens for the user in the same save.

## Notes

- `user.active ?? true` treats a missing field as *active*. This means legacy documents without the field are considered active; `activate` on such a doc will 409, and `deactivate` will proceed.
- The outbox nudge (`nudgeOutbox()`) is deliberately called **after** the transaction commits. Calling it inside the transaction would let the relay read uncommitted data.
- `activate` does **not** call `markSessionsEnded`. Sessions from before deactivation remain ended (they were killed in `deactivate`); the owner must sign in again to obtain new tokens.
- The 409 responses use structured error objects (`code` + `message`) rather than a plain string, distinguishing them from the 404 which uses a plain localized string.
- Analytics is emitted only on deactivation, not activation — the module comment notes this is a churn signal, not merely an admin action.
