# src/modules/account/services/authentication.ts

## Purpose

Handles the write-side of identity: issuing and revoking opaque tokens (password-reset, account-deletion, session refresh) and the login/logout endpoints that surround them. It deliberately does **not** store or verify credential values — hashing lives in the model's pre-save hook, JWT signing in `../session/jwt`, and password changes in `./profile`.

## Key elements

- **`tokenAdd(user, type, expirationTime?)`** — Core token writer. Generates a random hex token and delegates the `$push` to the user document's own method. All higher-level flows call this; it is the single mutation point for the `tokens` array.
- **`requestAccountDeletion(user, context)`** — Issues a 1-hour `delete` token, emails the link (high priority), and audits the request. Token value never leaves this function.
- **`requestPasswordReset(email, context)`** — Looks up the user by email; if found, issues a 1-hour `password` token and emails it. Returns a boolean (mail sent?) for the caller's metrics only — the HTTP response is always 200 to prevent address enumeration.
- **`requestAccountSetup(user)`** — Same token type/TTL as reset, but emails `setupRequestEmail` copy. Called from the `users` module's `USER_SETUP_REQUESTED` event; no `CallerContext` and no audit (already recorded upstream).
- **`sessionRevoke(userId, sessionId, context)`** — Removes a specific session by id. Emits an audit event **only** when `modifiedCount > 0` (the token actually existed).
- **`logoutCurrentSession(refreshToken?, context)`** — Revokes the refresh token named by the cookie (if present) and always audits + emits an analytics event. A missing cookie is not an error.
- **`refreshAccessToken(refreshToken?, context)`** — Calls `rotateRefreshToken` to exchange a valid refresh token for a fresh access/refresh pair. Distinguishes three audit outcomes: missing, invalid, and **reuse** of an already-rotated token (separate audit action + `metadata.reason`).
- **`PASSWORD_RESET_TOKEN_TYPE`** / **`PASSWORD_RESET_TOKEN_TTL_MS`** — Named constants (`'password'` / 1 hour) so the type and its TTL stay co-located as policy.
- **`DUMMY_PASSWORD_HASH`** — A one-time `bcrypt.hashSync` of random bytes, computed at import. Used by `login` (not shown in excerpt) to equalize response timing for unknown vs. known emails.
- **`MissingRefreshTokenError`** — Internal sentinel so the single `.catch` in `refreshAccessToken` can tell "no cookie" apart from "bad token" without branching twice on the happy path.

## Relationships

- **`../emails`** (`src/modules/account/emails.ts`) — Supplies the three mail builders (`deleteRequestEmail`, `resetRequestEmail`, `setupRequestEmail`) that render finished, locale-resolved copy before the job is queued.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is the sole egress for all token-bearing links; always passed `'high'` priority.
- **`@infrastructure/observability/audit`** + **`../audit`** — Every user-visible action emits an audit event; `accountAuditActions` provides the stable action strings.
- **`@infrastructure/observability/analytics`** + **`../analytics`** — `logoutCurrentSession` (and likely `login`) emits analytics via `accountAnalyticsEvents`.
- **`@infrastructure/http/request`** — `CallerContext` carries `locale`, `actor` info, and is threaded into every audit/analytics call.
- **`@infrastructure/http/response`** / **`@infrastructure/http/errors`** — Response envelopes (`generateSuccess`, `generateReject`, `rejectDatabaseEnvelope`) shape the controller-facing return values.
- **`@infrastructure/i18n`** — `getDefaultLocale` provides the fallback when neither the user's stored locale nor the request locale is available.
- **`../session/jwt`** — `rotateRefreshToken` and `TokenReuseError` handle the actual JWT rotation; this file orchestrates around them.
- **`services/index.ts`** — Re-exports this module's public API to the rest of the account service layer.
- **`./verification`** — Sibling service that follows the same "named token-type + TTL constant" convention.

## Notes

- **Token array is append-only.** The comment in `tokenAdd` calls out that `user.tokens = [...]` must never be used; a full-array write erases tokens added by a concurrent request (e.g., two sessions plus a reset link).
- **Silent success is a security feature.** `requestPasswordReset` always resolves (true/false internally) so the HTTP layer can answer 200 regardless; the boolean is for metrics, not client-facing.
- **Token values are file-private.** Every public function that issues a token keeps the value in closure scope and passes it directly to the mail builder — no export, no return, no intermediate storage.
- **Audit fidelity.** `sessionRevoke` audits only on a real match; `refreshAccessToken` uses a distinct action for reuse vs. invalid. Do not collapse these — they answer different questions for the reader of the trail.
- **`DUMMY_PASSWORD_HASH` is a boot-time cost, not per-request.** It exists solely to make the unknown-email path pay the same bcrypt cost as a wrong-password path, eliminating the timing oracle.
