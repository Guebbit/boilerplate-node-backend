---
source: src/modules/account/cooldown.ts
sha256: 73d37260b022f913b42c0b83c30ea81c087c970b569ed0cff06394f10c7a66f6
generated_at: 2026-11-08T04:08:36.254213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/cooldown.ts

## Purpose

Provides a single source of truth for the "wait before re-sending" countdown shared by the 2FA delivered-code flow and the verification-link flow. Both flows publish mail on a button press and must render the same countdown semantics to the client; centralising the calculation here guarantees that.

## Key elements

- **`cooldownRemaining(sentAt, seconds, now?)`** — Returns whole seconds still to wait (rounded up so the client never re-enables its button early), or `0` when no send has occurred yet or the window has elapsed. `now` is injectable for tests.
- **`resendTooSoon(code, message, seconds)`** — Builds a `429` `ResponseReject` whose `details.retryAfter` carries the same seconds value a successful response would have promised as `resendAfter`, letting the client render a countdown instead of a generic "too many requests" error.

## Relationships

- **`src/infrastructure/http/response.ts`** — Direct import of `generateReject` and the `ResponseReject` type; `resendTooSoon` delegates 429 construction to that module.
- **`src/modules/account/two-factor/delivered-codes.ts`** — One of the two consumer flows named in the module doc. The file deliberately lives at the `account/` module root (not under `services/`) so `two-factor/` can reach it with the same `../` pattern it already uses for `../emails` and `../session/`, avoiding a `two-factor → services` dependency edge.
- **`src/modules/account/services/verification.ts`** — The other named consumer flow; uses the shared countdown shape for the verification-link resend.

## Notes

- The module holds **no** i18n keys, database access, or non-default clock. Callers supply the translated message, the time window, and (optionally) the anchor date.
- `cooldownRemaining` uses `Math.ceil` on the remaining interval — a client that rounds down would re-enable the button one second early.
- `resendTooSoon`'s `details.retryAfter` is intentionally identical to the `resendAfter` field a success response carries, so a well-behaved client that honours the success-promise never encounters the 429 path.
