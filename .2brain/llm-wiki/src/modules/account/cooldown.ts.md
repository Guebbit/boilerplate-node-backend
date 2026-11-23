---
source: src/modules/account/cooldown.ts
source_sha256: 383b6d91719388641b7fade391cfa06b4e7cd5590ab9bb62fd86d53ad7e114bc
context_sha256: 516be0258b90456fe697e36a26f556a76a11edb93446b2423a28f84684355e2d
generated_at: 2026-11-22T03:28:08.097261+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/cooldown.ts

## Purpose
Defines the shared shape of a "you just asked for this, wait a moment" refusal. Two flows send mail on a button press: the 2FA delivered code and the verification link. Both need a countdown that means the same thing to the client, so it is computed in one place. The file sits at the module root rather than under `services/`, so `two-factor/` can import it without creating a `two-factor` → `services` dependency. It holds no database access, no i18n keys and no clock beyond a default `now`. The caller supplies the anchor time, the window and already-translated text.

## Key elements
- `cooldownRemaining(sentAt, seconds, now = new Date())` returns the whole seconds left before another send is allowed, or `0` if a send may go ahead.
  - It returns `0` when `sentAt` is `undefined`, because nothing was ever sent.
  - The result is rounded up with `Math.ceil` and clamped to a minimum of `0`, so a client never re-enables its button early.
  - `now` can be injected for tests.
- `resendTooSoon(code, message, seconds)` builds the 429 `ResponseReject` by calling `generateRateLimited(seconds, { code, message })`.
  - `code` is the flow's own `ErrorCode`, which the client branches on.
  - `message` must already be translated.
  - `seconds` is expected to be the value `cooldownRemaining` returned.

## Relationships
- `src/infrastructure/http/response.ts`: supplies `generateRateLimited` and the `ResponseReject` type. `resendTooSoon` delegates the actual 429 construction to it.
- The other neighbors are the consumers named in the module doc: `src/modules/account/services/verification.ts` (verification link) and `src/modules/account/two-factor/delivered-codes.ts` (2FA delivered code). The remaining neighbors are `email-change.ts`, `password-reset-request.ts` and `two-factor-outcomes.ts`. This file does not import any of them, and its source does not say how they use it.

## Notes
- `details.retryAfter` is intended to equal the `resendAfter` value the successful response promised. A client that honors that promise should never see this 429.
- Rounding up means the reported wait can be up to a second longer than the true remaining time. That is deliberate.
