---
source: src/modules/users/services/activation.ts
sha256: d882b9e3deba597880a894292712eb488d62d3cd4e6258285a7cf9d1bb1f4a29
generated_at: 2026-11-14T22:26:17.437093+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/activation.ts

## Purpose

Service layer for toggling an account's active state (`activate` / `deactivate`). Deactivation is modeled as a ban: it ends every held session within the same transaction that persists the flag and announces `user.deactivated`, preventing stale one-time links from surviving a later re-activation. Both operations are non-idempotent—they return 409 on a repeat rather than silently succeeding.

## Key elements

- **`activate(id, context)`** — Sets `user.active = true` and saves. Returns 409 `USER_ALREADY_ACTIVE` if already active. Does **not** re-create sessions; the owner logs in anew.
- **`deactivate(id, context)`** — Sets `user.active = false`, calls `markSessionsEnded(user)`, saves inside a transaction, announces `USER_DEACTIVATED` via the outbox, then (post-commit) nudges the outbox relay, records an audit entry, and emits a product analytics event. Returns 409 `USER_ALREADY_INACTIVE` if already inactive.
- Both delegate lookup, authorization, and error shaping to the `withClearedAccount` wrapper.

## Relationships

- **`src/modules/users/services/cleared-account.ts`** — `withClearedAccount` provides the shared guard: 404 if missing, 403 `ROLE_MANAGEMENT_REQUIRED` for unauthorized staff, then hands a hydrated document to the callback.
- **`src/modules/users/services/credentials.ts`** — `markSessionsEnded` invalidates all sessions on the user document before the save.
- **`src/modules/users/repository.ts`** — `userRepository.save` persists the document (optionally within a given session for transactional writes).
- **`src/modules/users/events.ts`** — `USER_DEACTIVATED` is the outbox announcement name emitted on deactivation.
- **`src/kernel/outbox.ts`** — `announceWithin` enqueues the event inside the transaction; `nudgeOutbox` flushes the relay after commit.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the save + announce in a single atomic unit (deactivate only).
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the 200 / 409 envelopes.
- **`src/infrastructure/i18n/index.ts`** — `t()` localizes the 409 error messages.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs `ADMIN_USER_UNBANNED` / `ADMIN_USER_BANNED`.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` emit a product-level `USER_DEACTIVATED` analytics signal (churn dashboards).
- **`src/modules/users/analytics.ts`** — `usersAnalyticsEvents.USER_DEACTIVATED` constant.
- **`src/modules/users/audit.ts`** — `usersAuditActions` constants.
- **`src/modules/users/model.ts`** — `UserDocument` type.
- **`src/modules/users/services/index.ts`** — Re-exports these functions for consumer modules.

## Notes

- `user.active ?? true` treats a missing field as active—accounts created before the flag existed are considered active by default.
- `nudgeOutbox()` is deliberately called **after** `withTransaction` resolves; the outbox relay reads what the transaction committed, so calling it inside would race.
- Deactivate emits **two** signals (audit + analytics) because the audit trail is for admin forensics while the analytics event is the product/churn metric; activation emits only the audit entry.
- Activation intentionally does **not** call `markSessionsEnded`—sessions were already ended at deactivation time and should stay ended until the user re-authenticates.
