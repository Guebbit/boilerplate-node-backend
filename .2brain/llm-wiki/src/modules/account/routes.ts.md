---
source: src/modules/account/routes.ts
sha256: 18dda5ff6c332c81f182cc8f431281a360270942b366ad4b20069c25addd2298
generated_at: 2026-10-15T09:59:03.684672+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/routes.ts

## Purpose

Express router that wires every account-related endpoint (auth, profile, password, 2FA, OAuth, sessions, email verification, account deletion) under the `/account` prefix. It centralises cross-cutting middleware (auth parsing, cache suppression, rate-limiting, human-challenge, idempotency, upload) so individual controllers stay thin and a future route cannot accidentally omit a guard.

## Key elements

- **`router`** (exported) — the `express.Router` instance; the single public export of this file.
- **`isChangingEmail`** (private) — predicate for `requireFreshAuthWhen`; compares the incoming `email` body field against `request.authContext.email` using `normalizeEmail` so case differences don't trigger a step-up. Must run after `upload.image()` so `request.body` is populated.
- **`callerHasTwoFactor`** (private) — true when `request.authContext.twoFactorArmed === true`; used to conditionally demand OTP proof on identity routes.
- **`isChangingEmailWithTwoFactor`** (private) — conjunction of the two predicates above; gates the OTP-proof requirement on email change.
- **`OTP_PROOF`** (private const) — `{ methods: ['otp'] }`, passed to `requireFreshAuthWhen` as the required AMR.
- Router-level middleware: `getAuth` (populates `authContext`) and `noStore` (prevents any downstream `setCache` from caching responses).
- Route definitions covering: `GET/PUT/PATCH/DELETE /`, login, signup, reset, password change/check, re-auth, 2FA (setup, confirm, send, backup codes, delete), sessions (list, touch, delete, logout-all), email verification, account export, OAuth links/start/callback, and account deletion request/confirm.

## Relationships

- **`@kernel/middlewares/authorizations`** — `getAuth` is mounted router-wide; `isAuth` guards most authenticated routes; `requireFreshAuth` / `requireFreshAuthWhen` gate destructive or identity-sensitive routes (delete account, email change, password change, logout-all, session deletion).
- **`@infrastructure/http/middlewares/cache`** — `noStore` is applied router-wide so no account response can be cached; documented to interlock with `setCache`'s refusal to override a marked response.
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` guards `PUT /` and `PATCH /` (avatar upload path). Module-local limiters in `./rate-limits` and `./mail-budget` provide the per-action budgets.
- **`@infrastructure/http/middlewares/human-challenge`** — `humanChallengeGate` (rung 3, off by default) on `POST /signup` and `POST /reset`.
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` on `POST /signup` to deduplicate double-submissions.
- **`@infrastructure/http/middlewares/origin`** — `requireAllowedOrigin` is imported for routes that need origin checking (OAuth flows).
- **`@infrastructure/http/middlewares/upload`** — `upload.image()` parses `multipart/form-data` on `PUT /` and `PATCH /` before the fresh-auth predicate runs.
- **`@infrastructure/persistence/normalize-email`** — used inside `isChangingEmail` to make the email-change comparison case-insensitive, matching the service-layer comparison.
- **Controllers (all under `./controllers/`)** — each route delegates to exactly one controller function (e.g. `deleteAccountRequest`, `deleteAccountConfirm`, `delete2fa`, `delete2faMethod`, `cancelPendingEmail`, `deleteSession`, `deleteOAuthLink`). This file only composes middleware around them.

## Notes

- **Middleware order on `PUT/PATCH /` is load-bearing.** `upload.image()` must precede `requireFreshAuthWhen(isChangingEmail, …)` because the predicate reads `request.body`, which is empty until multer finishes parsing. Swapping the order silently disables the email-change gate.
- **OTP guard runs before the plain fresh-auth guard.** A stale *armed* session is challenged once with `details.methods: ['otp']`; the second `requireFreshAuthWhen` then only sees accounts *without* a second factor, avoiding a redundant challenge.
- **`noStore` at router level vs. per-route `setCache`.** If a future route mounts both, `setCache` will refuse to set `Cache-Control` on a `noStore`-marked response. Do not remove the router-level `noStore` to "optimise" a single GET.
- **Signup uses `signupLimiters`, not `credentialLimiters`.** A successful signup returns 201, which `credentialLimiters`' `skipSuccessfulRequests` would not count against the budget.
- **`isChangingEmail` is intentionally not exported.** The wiring is validated by hitting `PUT /account` end-to-end (stale session → challenged or not), not by unit-calling the predicate.
- The address-book module reuses the `/account` prefix under its own router (`@modules/addresses/routes`); path conflicts are avoided there, not here.
