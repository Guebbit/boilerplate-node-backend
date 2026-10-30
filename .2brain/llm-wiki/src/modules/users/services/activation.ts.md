---
source: src/modules/users/services/activation.ts
sha256: 95f038c23abe748fbc5fe396a1ef1686ee20624c0689d2acf87e3e853898bd37
generated_at: 2026-10-29T06:15:23.535537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/activation.ts

## Purpose

Implements account activation and deactivation (unban / ban). Deactivation is treated as a hard ban: it ends every session the account holds and emits a `user.deactivated` domain event, all within a single database transaction. Both operations reject a no-op repeat with a 409 rather than returning a misleading success.

## Key elements

- **`activate(id, context)`** (exported) — Flips `user.active` to `true`, persists via `userRepository.save`, records an audit entry (`ADMIN_USER_UNBANNED`). Returns 404 if the user is missing, 403 if the caller lacks management rights, or 409 `USER_ALREADY_ACTIVE` if the flag is already set.
- **`deactivate(id, context)`** (exported) — Sets `user.active` to `false`, calls `markSessionsEnded`, then saves the user and announces `USER_DEACTIVATED` inside one `withTransaction`. After commit it nudges the outbox, records an audit entry (`ADMIN_USER_BANNED`), and emits an analytics event (`USER_DEACTIVATED`). Same 404 / 403 / 409 (`USER_ALREADY_INACTIVE`) guards as `activate`.
- **`withClearedAccount(id, context, next)`** (module-private) — Shared preamble: loads the user by id, returns a 404 rejection if absent, then checks `accessService.roleProtectedRefusal` before delegating to `next`.

## Relationships

- **`@infrastructure/http/response`** — Builds all return values via `generateSuccess` / `generateReject`; types `ResponseSuccess<UserDocument>` and `ResponseReject` shape every return.
- **`@infrastructure/i18n`** — Localised user-facing messages (`users.not-found`, `users.already-active`, `users.already-inactive`) through `t`.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the save + announce pair in `deactivate` so both commit atomically.
- **`@kernel/outbox`** — `announceWithin` enqueues the `USER_DEACTIVATED` domain event inside the transaction; `nudgeOutbox` dispatches it after the commit.
- **`@infrastructure/observability/audit`** — `recordAudit` logs the administrative action in both `activate` and `deactivate`.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` fire a product-level churn signal on deactivation only.
- **`@modules/access`** — `accessService.roleProtectedRefusal` gates whether the caller may manage the target account (staff protection).
- **`../model`** — `UserDocument` is the persisted shape read and mutated here.
- **`../repository`** — `userRepository.findById` / `save` perform all persistence.
- **`../analytics`** — Provides the `usersAnalyticsEvents.USER_DEACTIVATED` constant.
- **`../audit`** — Provides `usersAuditActions.ADMIN_USER_UNBANNED` / `ADMIN_USER_BANNED` constants.
- **`../events`** — Supplies the `USER_DEACTIVATED` event name used in the outbox announcement.
- **`./credentials`** — `markSessionsEnded` invalidates every session token held by the deactivated user.

## Notes

- **Deactivation ≠ flag flip.** `markSessionsEnded` is called before the save; the `active` gate alone would let stale one-time links survive a subsequent re-activation. The session purge and the flag change must land in the same write.
- **`active` defaults to `true`.** Both guards use `user.active ?? true`, so a document without the field is treated as active.
- **`nudgeOutbox` is post-commit.** The comment is explicit: the relay reads whatever the transaction wrote, so the nudge must not run inside `withTransaction`.
- **409s are returned, not thrown.** `withClearedAccount` and both exports follow the same pattern: a missing user yields a 404 rejection (not an exception), and a no-op state yields a 409 rejection, keeping the error surface uniform for the HTTP layer.
- **Deactivate emits two observability signals** (audit *and* analytics) whereas activate emits only the audit record. The analytics event exists because a plain "user updated" signal is invisible on churn dashboards.
