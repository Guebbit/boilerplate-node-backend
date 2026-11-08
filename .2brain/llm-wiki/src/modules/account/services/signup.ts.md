---
source: src/modules/account/services/signup.ts
sha256: de5f5786f9ae57b658f34232719b633a4430487c909dfd3fb19b8fce8e58a6ea
generated_at: 2026-11-08T04:23:17.742027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/signup.ts

## Purpose

Implements the `POST /account/signup` handler. Validates the submitted fields, runs two anti-automation gates (breached-password check, email-policy check), and—if the email is free—creates the account and its starting role. All success and failure paths are funnelled into a uniform `ResponseSuccess | ResponseReject` envelope.

## Key elements

- **`SignupInput`** (interface) — Flat object holding `email`, `username`, `password`, `passwordConfirm`, `analyticsConsent` (optional boolean), and `termsAccepted` (must be `true`). Replaces a positional parameter list.
- **`guardBreachedPassword`** (internal) — Calls `assertPasswordNotBreached`; returns a 422 reject if any breach errors are found, otherwise `undefined` to continue.
- **`guardEmailPolicy`** (internal) — Calls `checkEmailPolicy` (antibot adapter). On a `'refused'` verdict it returns a **decoy success** built from `userService.buildSignupDecoy` (never persisted); otherwise `undefined`.
- **`createAccountIfEmailFree`** (internal) — Single DB path: checks `userService.emailTaken`, rejects 409 on a collision, or calls `userService.registerSelfService` + `enqueueIfPending` to create and return the user. All DB errors are caught by `rejectDatabaseEnvelope`.
- **`signup`** (exported) — Orchestrator. Validates via Zod (`SignupBody` extended with `analyticsConsent` and `termsAccepted` checks, plus a `superRefine` for password match), then chains the three gates in order. Post-processing records an audit entry (distinguishing real success from decoy/failure via `data.isNew`) and emits an analytics event on success.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/adapters/antibot.ts` | Calls `checkEmailPolicy` for the rung-2 anti-automation gate. |
| `infrastructure/http/errors.ts` | Uses `rejectDatabaseEnvelope` to shape unexpected DB failures. |
| `infrastructure/http/request.ts` | Uses `parseFormBoolean` to decode multipart boolean fields. |
| `infrastructure/http/response.ts` | Builds every response via `generateSuccess`, `generateReject`, and `validationErrors`. |
| `infrastructure/http/schemas.ts` | Imports `optionalBooleanSchema` for `analyticsConsent` parsing. |
| `infrastructure/i18n/index.ts` | Calls `getCurrentLocale` (captured into the new user doc) and `t` for all user-facing messages. |
| `infrastructure/observability/analytics/index.ts` | Emits `emitAnalyticsEvent` + `buildAnalyticsBase` on successful signup. |
| `infrastructure/observability/audit.ts` | Calls `recordAudit` on every outcome (success, decoy, failure). |
| `infrastructure/security/breached-passwords/index.ts` | Calls `assertPasswordNotBreached` as the first gate. |
| `modules/account/analytics.ts` | Reads `accountAnalyticsEvents.USER_SIGNED_UP` for the analytics event name. |
| `modules/account/audit.ts` | Reads `accountAuditActions.AUTH_SIGNED_UP` for the audit action name. |
| `modules/account/consent-record.ts` | Calls `analyticsAnswer` and `termsAcceptance` to build the consent payload stored on the document. |
| `modules/account/services/index.ts` | Re-exports this file's `signup` as part of the account service surface. |

## Notes

- **Decoy detection in the audit block:** `result.data.isNew` (Mongoose) is still `true` for the rung-2 decoy document because it was never `.save()`-ed. The code treats `isNew === true` as "no real account was created" and records the audit as a failure. This is the *only* path that returns an unsaved document, so the check is safe—but it inverts the intuition that `isNew` means "just created."
- **`termsAccepted` vs `analyticsConsent`:** `termsAccepted` must be the literal `true` (Zod `z.literal(true)` after `parseFormBoolean`); any other value is a 422. `analyticsConsent` is genuinely optional—absent parses to `undefined` and is stored as `false`. Both use the same multipart-string decode, hence the separate schema treatments.
- **Gate order is intentional and cheap-first:** breached-password → email-policy → DB lookup. Each gate that answers short-circuits the rest, so a rejected request avoids the single DB round trip.
- **Locale is snapshotted at signup time** (`getCurrentLocale()`) and stored on the user document so later background work (queued emails, nightly jobs) can act in the user's language without a live request.
