---
source: src/modules/account/controllers/post-password-change.ts
sha256: f758edcf5873100cedfb7bc7ba163affbb2065d2a06fcaea59825b6e91a318d7
generated_at: 2026-09-27T14:25:20.224162+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-change.ts

## Purpose
HTTP controller for `POST /account/password`. Accepts a verified caller's current password and a new one, delegates the actual change and cross-session revocation to `accountService.passwordChangeWithCurrent`, then re-mints the caller's own session token so they remain signed in to the tab they are typing in.

## Key elements
- **`postPasswordChange(request, response)`** — the sole export. Performs shape validation (field presence via a stripped-down `ChangePasswordBody` zod schema), calls the service, handles success/refusal/database-error paths, and issues a new session token.
- **`changePasswordShape`** — a local zod schema derived from the API contract's `ChangePasswordBody` with content rules (min length, etc.) removed. Exists so that *absent* fields produce a generic validation 400 here, while *content* violations (weak password, mismatch, wrong current) are answered by the service in the caller's language.
- **Session re-mint with graceful degradation** — if `issueSession` throws after the password write and cross-session revoke have already committed, the controller logs a warning, still increments the success metric, and returns 200 with no token rather than a 500. The password *did* change; a 500 would misreport reality.

## Relationships
- **`routes.ts`** — wires `POST /account/password` to `postPasswordChange`, behind the `isAuth` middleware that populates `request.authContext`.
- **`services/index.ts`** — calls `accountService.passwordChangeWithCurrent`, which performs the password verification, write, and revocation of all *other* sessions.
- **`session/session.ts`** — calls `issueSession` to mint a fresh token for the caller after the change.
- **`metrics.ts`** — increments `authPasswordChangeTotal` with `{ status: 'success' | 'failure' }` on every terminal path.
- **`controller.ts`** — uses `rejectValidation` (shape errors) and `refused` (service-level refusals like wrong current password).
- **`errors.ts`** — delegates unhandled DB/service errors to `rejectDatabaseError`.
- **`request.ts`** — extracts `callerContextOf(request)` to pass locale/IP context into the service for localized error copy.
- **`response.ts`** — sends the final 200 via `successResponse` with an i18n success message.
- **`i18n/index.ts`** — calls `t('account.password-change.success')` for the localized success string.
- **`logger.ts`** — emits a `warn`-level entry when the re-mint fails but the password change succeeded.
- **`types/index.ts`** — imports `ChangePasswordRequest` (typed request body) and `AuthTokens` (response payload shape).

## Notes
- Shape validation is intentionally split from content validation: the controller only checks that `currentPassword`, `password`, and `passwordConfirm` are *present strings*. All policy (min length, complexity, mismatch) lives in the service so error copy can be localized.
- The `changePasswordShape` schema is derived from the generated `ChangePasswordBody` contract; if a field is added to the contract, this local shape must be updated too (noted in the inline comment).
- The re-mint-failure path returns `200` with an empty body (`undefined` as the data arg) rather than the usual `{ token }` shape — clients should treat "no token in body" as "password changed, but you need to re-authenticate."
- The service is expected to revoke every *other* session; this controller does **not** invalidate the caller's own session before re-minting.
