---
source: src/modules/account/consent-record.ts
sha256: 55567287a5b6ded5c665c222b6dc9ea4992fe4a18cf6c25cc7ad987f08f5f544
generated_at: 2026-11-08T04:00:21.797382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/consent-record.ts

## Purpose

Data-protection record module that stamps, at account-creation time, which terms version was in force, when the user accepted them, and what analytics choice (if any) the signup carried. These fields are later read by controllers to display "who agreed to what, and when."

## Key elements

- **`termsVersion(): string`** — Returns the configured `NODE_TERMS_VERSION` label (default `"1"`) from `accountConfig()`.
- **`termsAcceptance(): { termsAcceptedAt, termsVersion }`** — Returns a timestamped snapshot of the current terms version; called by any path that presents terms before creating the account.
- **`analyticsAnswer(analyticsConsent?: boolean): { analyticsConsent?, analyticsConsentAt? }`** — Returns `{}` when the consent checkbox was absent (no question asked), otherwise a timestamped boolean record.

## Relationships

- **`src/modules/account/config.ts`** — Sole import: provides `accountConfig()` which supplies `NODE_TERMS_VERSION`.
- **`src/modules/account/services/signup.ts` / `oauth.ts`** — Consumers; the JSDoc states "every path that shows the terms before it creates the account stamps this," pointing to these signup flows as callers of `termsAcceptance` and `analyticsAnswer`.
- **`src/app/config-routes.ts`** — Publishes `termsVersion()` so `GET /shop` can print the in-force label (shop group reads from the foundation; no reverse dependency).

## Notes

- `analyticsAnswer` returns a plain empty object (not `null`/`undefined`) when consent is absent. Downstream code must treat "no key" as "nobody was asked," which is distinct from an explicit `false`.
- The module is intentionally dependency-light (one import) so the shop/route layer can reference the version string without pulling in the full services barrel.
