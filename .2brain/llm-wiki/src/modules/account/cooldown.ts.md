---
source: src/modules/account/cooldown.ts
sha256: 73d37260b022f913b42c0b83c30ea81c087c970b569ed0cff06394f10c7a66f6
generated_at: 2026-10-14T08:38:27.066813+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/cooldown.ts

## Purpose

Single source of truth for the "please wait before resending" logic shared by every account flow that publishes a one-time mail (2FA code, verification link, password-reset link, reauth token, etc.). Centralising the countdown calculation and the 429 response shape ensures every client renders the same semantics without each service re-implementing the arithmetic or the error envelope.

## Key elements

- **`cooldownRemaining(sentAt, seconds, now?)`** — Returns the whole seconds still to wait (0 if a send is allowed now). Uses `Math.ceil` so a client never re-enables its button early. Accepts an injectable `now` clock for testing; defaults to `new Date()`.
- **`resendTooSoon(code, message, seconds)`** — Builds a `429` `ResponseReject` whose `details.retryAfter` equals the `cooldownRemaining` result, giving the client a structured countdown instead of a generic "too many requests."

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and the `ResponseReject` type; `resendTooSoon` delegates to `generateReject` to produce the HTTP envelope.
- **`src/modules/account/two-factor/delivered-codes.ts`** — Consumes `cooldownRemaining` / `resendTooSoon` for the 2FA code-resend guard. The file is deliberately placed at the module root (not under `services/`) so this path resolves as `../cooldown` without introducing a `two-factor → services` dependency edge.
- **`src/modules/account/services/verification.ts`** — Consumes the same two exports for the verification-link resend guard.
- **`src/modules/account/services/password-reset-request.ts`**, **`profile.ts`**, **`reauth.ts`**, **`two-factor-outcomes.ts`** — All listed graph neighbors that publish a one-time mail and therefore reuse `cooldownRemaining` / `resendTooSoon` for their respective resend windows.

## Notes

- No database, no i18n, no internal clock. The caller supplies the `sentAt` anchor, the window in seconds, and an already-translated message string.
- The 429 `details.retryAfter` is intentionally the same number the successful response advertised as `resendAfter`; a well-behaved client that respected the promise should never hit the 429.
- `sentAt === undefined` is treated as "nothing ever sent" and yields `0` immediately—no special-case needed at the call site.
