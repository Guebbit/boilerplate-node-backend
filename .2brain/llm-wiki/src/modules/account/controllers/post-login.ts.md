---
source: src/modules/account/controllers/post-login.ts
sha256: d02bc19f20648b30e0b015824aa27bb6aae31cf4e9baed2ece7ccd315528435a
generated_at: 2026-09-27T14:24:58.310779+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login.ts

## Purpose

Controller for `POST /account/login`. Validates the `remember` tier, delegates credential checking to `accountService.login`, then either returns a 2FA challenge or mints a full session (refresh cookie + short-lived access token). All login success/failure observability is emitted here, deliberately outside the service layer, so that malformed-body 422s raised by the service still land in the audit trail.

## Key elements

- **`postLogin`** (exported) — the sole export. Takes an Express `Request<…, LoginRequest | undefined>` and `Response`. Orchestrates: body guard → `remember` validation → `runTokenCleanup` → `accountService.login` → 2FA branch or `issueSession` → `isUnrestrictedCaller` → response. Catches all downstream errors into `rejectDatabaseError`.
- **`rememberSchema`** (module-private) — Zod schema that validates the optional `remember` field against the `RefreshTokenExpiryTime` enum before the value is allowed to influence cookie lifetimes.

## Relationships

- **`routes.ts`** — registers `postLogin` on the `POST /account/login` route.
- **`services/index.ts`** — re-exports `accountService`, `twoFactorService`, and `runTokenCleanup`, which this controller calls directly.
- **`services/token-cleanup.ts`** — provides `runTokenCleanup`, executed before every login attempt.
- **`session/session.ts`** — provides `issueSession`, which sets the refresh cookie and returns the access token.
- **`session/config.ts`** — supplies `RefreshTokenExpiryTime`, the enum used by `rememberSchema`.
- **`session/login-observability.ts`** — provides `recordLoginSuccess` / `recordLoginFailure`, called in the controller (not the service) to keep audit coverage complete.
- **`roles.ts`** — provides `isUnrestrictedCaller`, used to tag the success record with the caller's role tier.
- **`@infrastructure/http/controller.ts`** — provides `rejectValidation` and `refused` for early-exit and rejection handling.
- **`@infrastructure/http/errors.ts`** — provides `rejectDatabaseError` for the catch-all error path.
- **`@infrastructure/http/response.ts`** — provides `successResponse` for the 200 replies.
- **`@types`** — supplies `LoginRequest` (body shape) and `LoginOutcome` (response payload).
- **`tests/unit/token-cleanup.test.ts`** — unit-tests `runTokenCleanup`; exercises a dependency of this controller but does not test `postLogin` itself.

## Notes

- **Express 5 body semantics:** `request.body` is `undefined` (not `{}`) when no parser matches the content-type. The `?? {}` guard in the destructure is load-bearing, not stylistic — without it the destructuring throws a `TypeError` before `accountService.login` can return its own 422.
- **Observability placement is intentional:** the controller records success/failure rather than the service, so that a 422 raised *by the service* (after the failure hook would have fired) still gets logged. A 422 raised in the controller (bad `remember` tier) bypasses recording by design — it reveals nothing about credentials.
- **2FA short-circuits session minting:** when `twoFactorEnabledAt` is set, no cookies or access token are issued. The response is a challenge object; completion is handled by a separate `postLoginTwoFactor` endpoint.
- **Role lookup is post-login and read fresh:** `isUnrestrictedCaller` is called *after* `issueSession` resolves, pulling the current membership state rather than a value embedded in the user document.
