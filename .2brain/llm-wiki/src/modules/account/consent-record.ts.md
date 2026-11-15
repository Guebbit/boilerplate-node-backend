---
source: src/modules/account/consent-record.ts
sha256: 19cc7de2bfca532190469f913fbec645b334b7f66af6019793190b1be36d8bec
generated_at: 2026-11-14T18:30:16.166114+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/consent-record.ts

## Purpose

Defines the consent "stamp" shapes an account carries for terms acceptance and analytics choice. Each exported function produces the exact object (timestamp + version/value) that a signup, provider sign-in, or first-password flow writes onto the account record, so the controller can later answer "who agreed to what, and when."

## Key elements

- **`termsVersion()`** — Reads `NODE_TERMS_VERSION` from `accountConfig()` and returns it as a string (defaults to `"1"`).
- **`termsAcceptance()`** — Returns `{ termsAcceptedAt: Date; termsVersion: string }`, capturing the current moment paired with the version in force at that moment.
- **`analyticsAnswer(analyticsConsent: boolean | undefined)`** — Returns `{ analyticsConsent, analyticsConsentAt: Date }` when a boolean is supplied; returns `{}` when the argument is `undefined` (i.e. the user was never asked).

## Relationships

- **`src/modules/account/config.ts`** — Source of `accountConfig`; this module reads `NODE_TERMS_VERSION` through it.
- **`src/app/config-routes.ts`** — Consumes `termsVersion()` so `GET /config` can expose the current terms label.
- **`src/modules/account/services/signup.ts`** — Calls `termsAcceptance()` and `analyticsAnswer()` during account creation to stamp the record.
- **`src/modules/account/services/oauth.ts`** — Stamps `termsAcceptance()` on provider-based sign-in.
- **`src/modules/account/services/password-reset.ts`** — Stamps `termsAcceptance()` when a staff-created account sets its first password.
- **`src/modules/account/services/index.ts`** — Barrel for the account services that import this module.
- **`scenarios/users.ts`** — Test scenarios that exercise the signup/sign-in paths which invoke these stamping helpers.

## Notes

- `analyticsAnswer` intentionally returns an **empty object** (not a null/undefined) when the user was not asked. Downstream code must treat the *absence of keys* as "no record yet," not as `false`.
- All three functions are pure "create the stamp" helpers; they do **not** read or mutate an existing account record. The caller is responsible for persisting the returned object.
- The terms version is a single config value, not a per-account field — every account stamped under the same `NODE_TERMS_VERSION` shares the same label.
