---
source: src/modules/account/services/signup.ts
sha256: 363c5222e79b18ad317f60a6149d103c510755ea7da19bece12d73fb2233baf8
generated_at: 2026-11-14T18:51:35.706113+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/signup.ts

## Purpose

Implements the `POST /account/signup` handler: validates the request body, runs two anti-abuse gates (breached-password corpus, anti-automation email policy), then creates the account and its starting role in a single database round trip. Returns a unified `ResponseSuccess<UserDocument> | ResponseReject` envelope.

## Key elements

- **`signupSchema`** (private) — Zod schema built from the API contract's `SignupBody`, extended with `analyticsConsent` (optional boolean), `termsAccepted` (must decode to `true`), and a `superRefine` that enforces `password === passwordConfirm`. Unknown keys are rejected (strict).
- **`SignupInput`** (exported type) — `z.infer<typeof signupSchema>`; the fully-parsed shape the handler works with.
- **`guardBreachedPassword`** (private) — Calls `assertPasswordNotBreached`; returns a 422 reject on match, `undefined` to continue.
- **`guardEmailPolicy`** (private) — Calls `checkEmailPolicy`; on `'refused'` returns a *decoy* `ResponseSuccess` built from an unsaved Mongoose document (so the caller gets a shape-indistinguishable success with nothing persisted). Otherwise returns `undefined`.
- **`createAccountIfEmailFree`** (private) — Single DB round trip: `emailTaken` check → 409 reject, or `registerSelfService` + `enqueueIfPending` → 200 success. Database errors are caught by the same `.catch` and returned via `rejectDatabaseEnvelope`.
- **`signup`** (exported) — The public handler. Parses the body, chains the three gates in order (first non-`undefined` result wins), then post-processes the outcome to record audit and analytics. Distinguishes a real signup from a rung-2 decoy via `result.data.isNew`.

## Relationships

- **`@infrastructure/adapters/antibot`** — calls `checkEmailPolicy` for the rung-2 gate.
- **`@infrastructure/security/breached-passwords`** — calls `assertPasswordNotBreached` before any other check.
- **`@infrastructure/http/response`** — uses `generateSuccess` / `generateReject` / `validationErrors` for all response shapes.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` wraps unexpected DB failures.
- **`@infrastructure/http/request`** — `parseFormBoolean` decodes multipart boolean strings for `termsAccepted`.
- **`@infrastructure/http/schemas`** — `optionalBooleanSchema` reused for `analyticsConsent`.
- **`@infrastructure/i18n`** — `t` for user-facing messages; `getCurrentLocale` stored on the new account for later async work.
- **`@infrastructure/observability/audit`** — `recordAudit` logs success/failure of signup.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` fire the `USER_SIGNED_UP` event.
- **`../consent-record`** — `analyticsAnswer` and `termsAcceptance` shape the consent data passed to account creation and the decoy.
- **`../analytics` / `../audit`** — event-name and action-name constants.

## Notes

- **Gate order is load-bearing:** breached-password → email-policy → DB lookup. A breached password short-circuits before the email policy runs, so a script with a known-bad hash never hits the decoy path.
- **`isNew` is read backwards in the audit block:** a *new* (unsaved) Mongoose document on a "success" result means the decoy was returned — i.e., no account exists. `result.data.isNew === true` is therefore treated as a *failure* for audit purposes.
- **`analyticsConsent` has no "leave unchanged" meaning at signup** (there is no prior value); absent is stored as `false`. This differs from the same field's semantics on `PUT/PATCH /account`.
- **The decoy document is never persisted.** The only observable difference from a real success is that `isNew` remains `true` and no DB write occurred — the audit path relies on exactly that.
- **`locale` is captured at signup time** (`getCurrentLocale()`) so downstream jobs (queued email, nightly batch) can render without needing the original `Accept-Language` header.
