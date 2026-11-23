---
source: src/modules/account/services/profile.ts
source_sha256: 6e762c6aea522a7465fa672fa0bc72213a665de03cfa8ed67a7d899bda4ed56d
context_sha256: 9f30491479c0a4b8709c194feb620abab0b7ba5623982bb6d2085607bfb515eb
generated_at: 2026-11-22T03:40:06.442998+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/profile.ts

## Purpose
Service-layer logic for the profile a person edits about themselves (`PUT`/`PATCH /account`). It reads the caller's own profile and applies validated profile changes, emitting analytics and audit records. Email changes (`./email-change`) and password changes (`./password`) start elsewhere.

## Key elements
- **`getOwnProfile(userId, context)`**: emits a `USER_PROFILE_VIEWED` analytics event, then returns the user via `accountUserService.findByIdWithPendingEmail` (`undefined` if not found).
- **`updateProfile(userId, changes, context)`**: the main entry point.
  - Loads the account through `withOwnAccount` (credentials included by default).
  - Computes audit metadata with `accountUserService.userAuditChanges` before the write.
  - Calls `writeProfile`.
  - On success, records an `AUTH_PROFILE_UPDATED` audit entry.
  - Maps thrown errors through `rejectDatabaseEnvelope('auth', error)`.
  - Returns `generateSuccess(result.data, 200)` on success.
- **`writeProfile` (not exported)**: persists via `accountUserService.updateOwnProfile`. If the call withdraws analytics consent (stored `true` → incoming `false`), it passes a callback that enqueues an `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` outbox event in the same transaction session. After a successful save it calls `nudgeOutbox()`.
- **`ProfileFields` (type, not exported)**: optional `username`, `locale`, `phone`, `website` and `analyticsConsent` from `UpdateAccountRequest`. Also `imageUrl` (string or `null` to remove), `thumbnailUrl` and `pendingImageKey`.

## Relationships
- **`@modules/users/friends/account` (`accountUserService`)**: does the actual reads, writes and audit-diff computation.
- **`@modules/users` (`UserDocument`)**: the returned and operated-on document type.
- **`./caller` (`withOwnAccount`)**: loads the caller's account for `updateProfile`.
- **`@infrastructure/http/response` and `errors`**: success and reject envelopes, and `rejectDatabaseEnvelope`.
- **`@infrastructure/observability/analytics` and `../analytics`**: `emitAnalyticsEvent`, `buildAnalyticsBase` and the `USER_PROFILE_VIEWED` event name.
- **`@infrastructure/observability/audit` and `../audit`**: `recordAudit` and the `AUTH_PROFILE_UPDATED` action.
- **`@kernel/outbox` and `../events`**: `enqueueOutboxEvent`, `nudgeOutbox` and the consent-withdrawn event constant.
- **`@types`**: `CallerContext` and `UpdateAccountRequest`.

## Notes
- `getOwnProfile` deliberately uses `findByIdWithPendingEmail` rather than `getById`. `getById` is shared with the admin `get-user.ts` lookup, which shouldn't see a pending email change. Emitting the view event inside `getById` would also miscount admin lookups as the user's own views. `pendingEmail` is otherwise `select: false`.
- `updateProfile` does not re-validate input. Shape validation happens once at the edge (`update-account.ts`).
- An omitted field means "leave it alone". The PUT path has already filled omitted fields with `null`.
- Image fields come from the server's own `readUploadedImage`, never from a client-supplied string.
- Profile updates are narrower than the admin `userService.updateById`. They exclude `admin`, `active`, `password` and `email`.
- Consent withdrawal is judged before the write mutates the document. Only a stored `true` followed by an incoming `false` counts. The outbox row commits atomically with the save.
- The audit metadata is read before the write for the same reason (the write assigns onto the document).
