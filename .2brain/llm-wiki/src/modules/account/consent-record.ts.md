---
source: src/modules/account/consent-record.ts
source_sha256: 4c5c796e7a8282f7b0712dffceed0bd3a663e5cf21979016f701114bd848e89a
context_sha256: 8e797b93304730e159d78047c86f0b1271fbc7d36c208a8e272b04939fd14d0e
generated_at: 2026-11-22T03:20:12.236345+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/consent-record.ts

## Purpose
Builds the consent-related fields stored on an account record: which Terms version is in force, when the terms were accepted, and the optional analytics-consent choice with its timestamp. These fields let the controller later show who agreed to what, and when.

## Key elements
- `termsVersion()` — returns `accountConfig().NODE_TERMS_VERSION` (default `1`). Published so `GET /config` can print it.
- `termsAcceptance()` — returns `{ termsAcceptedAt: new Date(), termsVersion }`, a record of accepting the terms now. Stamped by signup, provider sign-in, and the first password set on a staff-created account.
- `analyticsAnswer(analyticsConsent)` — takes the signup's optional checkbox. Returns `{}` if the value is `undefined`. Otherwise it returns `{ analyticsConsent, analyticsConsentAt: new Date() }`.

## Relationships
- Reads `NODE_TERMS_VERSION` through `accountConfig()` from `src/modules/account/config.ts`.
- `src/app/config-routes.ts` uses `termsVersion()` for `GET /config`.
- The services (`src/modules/account/services/signup.ts`, `src/modules/account/services/oauth.ts`, `src/modules/account/services/password-reset.ts`) are the places the doc comments describe as stamping these fields: signup, provider sign-in, and the first password set on a staff-created account.
- `src/modules/account/services/index.ts`, `scenarios/users.ts` and `src/modules/orders/services/place.ts` are graph neighbors. Nothing in this file shows how they interact with it.

## Notes
- Both functions that return timestamps call `new Date()` on each call, so the stamp is the moment of the call and the result is not cached.
- An absent analytics answer (`undefined`) is deliberately not recorded. The doc says nobody was asked, so a banner choice may still apply.
