---
source: src/modules/account/cooldown.ts
sha256: 383b6d91719388641b7fade391cfa06b4e7cd5590ab9bb62fd86d53ad7e114bc
generated_at: 2026-11-14T18:35:17.472559+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/cooldown.ts

## Purpose

Shared helper that computes the remaining cooldown before a "resend" action is allowed and produces the 429 response the client turns into a countdown. It exists so the two flows that publish mail on a button press — the 2FA delivered code and the verification link — share one source of truth for both the arithmetic and the error shape.

## Key elements

- **`cooldownRemaining(sentAt, seconds, now?)`** — Returns whole seconds (rounded up) still to wait before the same send may recur, or `0` if nothing was ever sent or the window has elapsed. `now` defaults to `new Date()` but is injectable for tests.
- **`resendTooSoon(code, message, seconds)`** — Builds a typed `ResponseReject` (HTTP 429) via `generateRateLimited`, carrying the caller-supplied `ErrorCode` and already-translated message. The `seconds` passed in should be the same value the successful response exposed as `resendAfter`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateRateLimited` and the `ResponseReject` type; the 429 is constructed through that factory.
- **`src/modules/account/two-factor/delivered-codes.ts`** — Consumer. The module is deliberately placed at the account-module root (not under `services/`) so that `two-factor/` can import it alongside its existing `../emails` and `../session/` paths without creating a `two-factor → services` edge.
- **`src/modules/account/services/verification.ts`** — Consumer. The verification-link resend flow uses the same `cooldownRemaining` / `resendTooSoon` pair to keep its countdown and 429 semantics identical to the 2FA flow.

## Notes

- Rounding is `Math.ceil`, never `Math.floor` or `Math.round` — the intent is that a client never re-enables its resend button one tick early.
- This module holds no i18n keys, no database handle, and no configurable clock; the caller supplies the anchor `Date`, the window in seconds, and pre-translated text.
- An absent `sentAt` (i.e. `undefined`) short-circuits to `0`; the code does not treat a past-date `sentAt` differently from a future one beyond the `Math.max(0, …)` clamp.
