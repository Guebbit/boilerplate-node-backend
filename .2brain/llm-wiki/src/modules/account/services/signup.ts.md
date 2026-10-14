---
source: src/modules/account/services/signup.ts
sha256: c341b88dd35a9070d4b5273882a35d7cc4533d45fec30eea9eebd6b1747aa8d4
generated_at: 2026-10-14T08:54:17.052127+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/signup.ts

## Purpose

Implements the `POST /account/signup` endpoint logic: validates submitted fields, runs anti-automation gates (breached-password corpus, email policy), then atomically creates the user account and its default `unverified` role in a single database transaction. Exports the `signup` handler and the `SignupInput` shape consumed by the route layer.

## Key elements

- **`SignupInput`** (interface) — flat object holding `email`, `username`, `password`, `passwordConfirm`, `analyticsConsent` (optional), and `termsAccepted` (required `true`). Chosen over positional args because optional fields and booleans make ordering fragile.
- **`guardBreachedPassword`** (private) — calls `assertPasswordNotBreached`; returns a 422 `ResponseReject` on a hit, `undefined` to continue. Runs first because a breached password is terminal on its own.
- **`guardEmailPolicy`** (private) — calls `checkEmailPolicy`; on a `'refused'` verdict returns a **decoy** `ResponseSuccess` built from an *unsaved* document via `userService.buildSignupDecoy`, so a scraping script sees a normal success. Returns `undefined` to continue.
- **`createAccountIfEmailFree`** (private) — checks `userService.emailTaken`; on a free email, runs `withTransaction` to call `userService.registerSelfService` then `assignDefaultRole` (hard-coded `'tenant'` scope, no role name — structurally limited to `unverified`). Catches DB errors into `rejectDatabaseEnvelope('auth', …)`.
- **`signup`** (exported) — orchestrates the pipeline: Zod validation (including `parseFormBoolean` pre-processing for `termsAccepted` and `analyticsConsent`), then the three gates in order (breach → antibot → create), finally records an audit entry and an analytics event. Distinguishes a real signup from the decoy via `result.data.isNew`.

## Relationships

- **`@infrastructure/adapters/antibot`** — calls `checkEmailPolicy` in `guardEmailPolicy`.
- **`@infrastructure/security/breached-passwords`** — calls `assertPasswordNotBreached` in `guardBreachedPassword`.
- **`@infrastructure/runtime/database`** — uses `withTransaction` to make account creation + role assignment atomic.
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject`, `validationErrors` shape every return value.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` converts thrown DB errors into a standard reject envelope.
- **`@infrastructure/http/request`** — `parseFormBoolean` decodes multipart `"true"`/`"false"` strings before Zod sees them.
- **`@infrastructure/http/schemas`** — `optionalBooleanSchema` re-used for `analyticsConsent`.
- **`@infrastructure/i18n`** — `t` for translated error messages; `getCurrentLocale` captured at signup time and stored on the user for later async work (queued emails, nightly jobs).
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` fire on successful signup.
- **`@infrastructure/observability/audit`** — `recordAudit` logs both success and failure (including the decoy refusal).
- **`@kernel/access/tenant`** — supplies `DEPLOYMENT_TENANT_ID` for the role-assignment scope.
- **`@modules/access`** — `assignDefaultRole` grants the starting role inside the same transaction.

## Notes

- **Decoy detection via `isNew`:** The antibot "refused" path returns a document that was never `.save()`-d, so Mongoose `isNew` stays `true`. The audit block uses this to write `outcome: 'failure'` and skip the analytics event. This is the *only* way to tell a decoy apart from a real signup after the pipeline resolves.
- **`termsAccepted` is not optional:** The schema uses `z.preprocess(parseFormBoolean, z.literal(true))` — absent or `"false"` is a 422. This is intentionally stricter than the `PUT/PATCH /account` endpoints, where the field is genuinely optional.
- **`analyticsConsent` absent → stored as `false`:** Unlike update routes where absent means "leave it alone," signup has no prior value, so `undefined` and explicit `false` are equivalent.
- **Role grant is name-locked:** `assignDefaultRole` takes no role-name parameter in the self-service path, making it structurally impossible for a normal signup to grant anything other than the deployment default (`unverified`).
- **Locale is snapshotted at signup:** `getCurrentLocale()` is written to the user document so that later work without a request context (queued welcome email, nightly jobs) can still use the correct language.
