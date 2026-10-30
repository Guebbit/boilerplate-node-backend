---
source: src/modules/account/consent-record.ts
sha256: 55567287a5b6ded5c665c222b6dc9ea4992fe4a18cf6c25cc7ad987f08f5f544
generated_at: 2026-10-29T02:25:39.515845+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/consent-record.ts

## Purpose

Defines the shape of consent data stamped onto an account at signup: which Terms version was accepted, when, and what analytics choice (if any) the user made. It centralises the "who agreed to what, and when" record so that downstream consumers (controllers, the shop endpoint) can read a consistent structure without re-deriving it.

## Key elements

- **`termsVersion()`** — Returns the currently in-force Terms label (`accountConfig().NODE_TERMS_VERSION`, default `"1"`). Published so `GET /shop` can display it.
- **`termsAcceptance()`** — Returns a `{ termsAcceptedAt: Date; termsVersion: string }` object representing the moment-and-text of acceptance. Called by every path that presents the Terms before creating an account.
- **`analyticsAnswer(analyticsConsent: boolean | undefined)`** — Returns either `{}` (no checkbox was present, so nothing is recorded and a later banner choice may still apply) or `{ analyticsConsent, analyticsConsentAt }`.

## Relationships

- **`./config`** — Sole import; reads `NODE_TERMS_VERSION` from `accountConfig()`.
- **`services/signup.ts`** — Calls `termsAcceptance()` and `analyticsAnswer()` to stamp the new account record.
- **`services/oauth.ts`** — Same pattern: stamps consent fields when an account is created via the OAuth flow.
- **`services/index.ts`** — Aggregates/re-exports the services that depend on this module.
- **`modules/shop/service.ts`** — Calls `termsVersion()` so the shop endpoint can print the active Terms label. (The shop reaches into the account foundation; never the reverse.)

## Notes

- `analyticsAnswer` returning `{}` (empty object) is intentional and distinct from `{ analyticsConsent: false }` — it signals "nobody was asked" rather than "user declined." Downstream logic must treat the two differently.
- The module is intentionally dependency-light (one import) so the shop layer can pull the version label without dragging in the rest of the account service graph.
