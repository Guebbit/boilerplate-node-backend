---
source: src/modules/account/session/device-cookie.ts
sha256: 541272bed9fccbf294a6aeaf0fce88cee76b0ee711eb7ababb8b3e4dc980aea8
generated_at: 2026-10-14T08:59:32.004890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/device-cookie.ts

## Purpose

Implements the OWASP "familiar-device" cookie pattern: after a fully successful login, a per-account HMAC token is stored in a browser cookie so that subsequent logins from that browser skip the **per-account** failure budget. Without it, an attacker who exhausts the account's lockout budget also locks out the legitimate owner. The cookie holds up to five account tokens, each keyed by `NODE_DEVICE_COOKIE_SECRET`, so forging one requires the deployment secret.

## Key elements

- **`DEVICE_COOKIE`** (`'device'`) — the cookie name, shared with rate-limit logic that reads it.
- **`MAX_TOKENS`** (5) / **`DEVICE_COOKIE_MAX_AGE_MS`** (180 days) — capacity and lifetime constants.
- **`tokenFor(email)`** — produces a base64url HMAC-SHA256 of the normalised email under the deployment secret; returns `''` when no secret is configured (nothing verifies).
- **`presentedTokens(request)`** — extracts and splits the cookie value; intentionally never throws so it can run inside a rate-limiter `skip` callback (fail-closed: "no cookie" ⇒ full budget applies).
- **`subjectOf(request)`** — resolves the account a request concerns: signed-in caller's email, else the `email` body field (same two sources the credential budget key uses).
- **`holdsDeviceCookie(request)`** — `true` when the cookie carries a token that constant-time-verifies for the request's subject.
- **`presentsFailingDeviceCookie(request)`** — `true` when a cookie is present but does **not** verify; lets rate-limiting count token-guessing in a separate budget.
- **`rememberDevice(request, response, email)`** — sets/refreshes the cookie after a successful login, prepending the new token and preserving existing ones (newest-first, capped at five).

## Relationships

- **`./config.ts`** — reads `sessionConfig().NODE_DEVICE_COOKIE_SECRET` as the HMAC key.
- **`./cookies.ts`** — spreads `secureCookieOptions()` into the cookie set in `rememberDevice`.
- **`@infrastructure/security/constant-time.ts`** — `constantTimeEqual` prevents timing side-channels in `holdsDeviceCookie`.
- **`@infrastructure/persistence/normalize-email.ts`** — normalises the email before hashing so case/domain variants agree.
- **`@infrastructure/http/middlewares/rate-limit.ts`** — provides `readBodyField`, which `subjectOf` uses to extract the email from unauthenticated login bodies.
- **`../rate-limits.ts`** — consumes `holdsDeviceCookie` (to skip the per-account budget) and `presentsFailingDeviceCookie` (to apply a separate token-guess budget).
- **`../controllers/post-login.ts`** / **`../controllers/post-login-2fa.ts`** — call `rememberDevice` after a fully successful (including 2FA) login.
- **`../tests/unit/device-cookie.test.ts`** — unit tests for the token round-trip and edge cases.

## Notes

- `presentedTokens` is written to **never throw**. It runs inside a rate-limiter `skip` callback where an exception would turn every login attempt into a 500. Treat "no cookie" as the only failure path.
- The separator `'.'` was chosen because it is outside the base64url alphabet, so a well-formed token can never contain it and splitting is unambiguous.
- If `NODE_DEVICE_COOKIE_SECRET` is unset, `tokenFor` returns `''`, `holdsDeviceCookie` is always `false`, and `rememberDevice` is a no-op — the feature silently disables rather than erroring.
- The cookie only exempts the **per-account** failure budget; per-address and per-block budgets still apply regardless.
