---
source: src/modules/account/services/signup.ts
sha256: de5f5786f9ae57b658f34232719b633a4430487c909dfd3fb19b8fce8e58a6ea
generated_at: 2026-10-29T02:45:06.831508+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/signup.ts

## Purpose

Implements the `POST /account/signup` handler. Validates the submitted fields, runs a sequential guard chain (breached-password check → anti-automation email policy → email-taken lookup + account creation), and records the outcome in audit and analytics. Returns a `ResponseSuccess<UserDocument>` or `ResponseReject` envelope.

## Key elements

- **`SignupInput`** (exported interface) — flat object holding email, username, password, passwordConfirm, optional `analyticsConsent`, and required `termsAccepted`.
- **`guardBreachedPassword`** (private) — queries the breach corpus; returns a 422 reject or `undefined` to pass.
- **`guardEmailPolicy`** (private) — calls the anti-automation adapter; on a *refused* verdict returns a decoy `ResponseSuccess` wrapping an **unsaved** Mongoose document (never persisted). Returns `undefined` to pass.
- **`createAccountIfEmailFree`** (private) — the single DB round-trip: checks email uniqueness, registers the user, enqueues if pending, or returns a 409 reject.
- **`signup`** (exported function) — orchestrates Zod validation, the three-guard chain, then post-processing (audit record, analytics event). The first guard to produce a result short-circuits the chain.

## Relationships

- **`@infrastructure/adapters/antibot`** — calls `checkEmailPolicy(email)` for the rung-2 anti-automation gate.
- **`@infrastructure/security/breached-passwords`** — calls `assertPasswordNotBreached(password)` as the first guard.
- **`@infrastructure/http/response`** — builds all success/reject envelopes (`generateSuccess`, `generateReject`, `validationErrors`).
- **`@infrastructure/http/errors`** — wraps uncaught DB errors via `rejectDatabaseEnvelope`.
- **`@infrastructure/http/request`** — uses `parseFormBoolean` to decode multipart boolean fields before Zod validation.
- **`@infrastructure/http/schemas`** — reuses `optionalBooleanSchema` for the `analyticsConsent` field.
- **`@infrastructure/i18n`** — calls `t()` for user-facing messages and `getCurrentLocale()` to stamp the user's signup language.
- **`@infrastructure/observability/analytics`** — emits `USER_SIGNED_UP` event on successful creation.
- **`@infrastructure/observability/audit`** — writes an `AUTH_SIGNED_UP` audit record (success or failure) on every path.
- **`../analytics`** — imports the `accountAnalyticsEvents` constant map.
- **`../audit`** — imports the `accountAuditActions` constant map.
- **`../consent-record`** — calls `analyticsAnswer()` and `termsAcceptance()` to shape the consent data stored on the document.
- **`./index`** (services barrel) — re-exports `signup` and `SignupInput` for route handlers.

## Notes

- **Decoy detection via `Document#isNew`:** the anti-automation path returns a `ResponseSuccess` whose `data` is a Mongoose document that was never `.save()`-d. The code detects this with `result.data.isNew === true` and records the audit entry as a failure. This is the only path that produces an unsaved document; all genuine successes have `isNew === false`.
- **Guard order is load-bearing:** breached-password check runs first so a bad password is rejected before any network/DB I/O. Email-policy (decoy) runs second. DB creation runs last. The first non-`undefined` result is returned.
- **`termsAccepted` is `z.literal(true)`, not a boolean:** the schema rejects `false`, absent, and any non-`true` value with a dedicated i18n message. `analyticsConsent` is `optionalBooleanSchema` (absent → `undefined` → stored as `false`).
- **`locale` is captured at signup** so downstream queued jobs (welcome email, nightly tasks) can render in the user's language without needing an `Accept-Language` header.
