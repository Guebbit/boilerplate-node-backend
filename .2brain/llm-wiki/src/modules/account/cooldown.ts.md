---
source: src/modules/account/cooldown.ts
sha256: a91eea2b0a8a1006559a83396047b3b1281b8aa2a19c8ebb9d76292182b578a0
generated_at: 2026-09-23T18:04:46.394350+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/cooldown.ts

## Purpose

Single source of truth for the "wait a moment before resending" countdown shared by the 2FA delivered-code and verification-link flows. By computing the remaining seconds and shaping the 429 rejection in one place, both flows present an identical cooldown to the client without duplicating logic.

## Key elements

- **`cooldownRemaining(sentAt, seconds, now?)`** — Returns whole seconds still to wait (0 if a send is allowed). Rounds **up** so a client never re-enables early. An absent `sentAt` short-circuits to 0. `now` is injectable for tests.
- **`resendTooSoon(code, message, seconds)`** — Builds a `ResponseReject` (HTTP 429) via `generateReject`. Carries `details.retryAfter` equal to the seconds `cooldownRemaining` produced, so a well-behaved client that honoured the earlier `resendAfter` promise never hits this path.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and the `ResponseReject` type; the sole outgoing dependency.
- **`src/modules/account/two-factor/delivered-codes.ts`** — Consumes this module (reaches it via a sibling `../` path, the placement rationale stated in the file header).
- **`src/modules/account/services/two-factor.ts`** / **`src/modules/account/services/verification.ts`** — The two flows whose button-press sends the module coordinates.

## Notes

- Deliberately lives at the **module root** (`account/`), not under `services/`, so `two-factor/` can import it without introducing a `two-factor → services` edge.
- Holds **no clock default beyond `new Date()`**, no database access, and no i18n keys — the caller supplies the anchor timestamp, the window, and already-translated text.
- `retryAfter` in the 429 body is intentionally the same value the success response promised as `resendAfter`; they are meant to be interchangeable from the client's perspective.
