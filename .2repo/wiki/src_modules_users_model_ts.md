# src/modules/users/model.ts

## Purpose

Defines the Mongoose schema, TypeScript document/service types, token subdocument methods, and the Zod wire-validation schema for the user record. Kept as a single file so the `pre-save` bcrypt hook and the `select: false` flag on `password` stay co-located—splitting them would risk a `.lean()` read leaking the hash.

## Key elements

- **`TokenType`** – Enum (`REFRESH`, `PASSWORD_RESET`) naming the two token kinds the JWT layer issues. Stored tokens also carry an account-deletion type not in this enum.
- **`hashToken(token)`** – SHA-256 hex digest used for all token storage/lookup. Exported so callers comparing in-memory tokens and the migration script hash identically.
- **`Token`** – Subdocument shape (`_id`, `token`, `type`, `expiration`, `lastUsedAt`, `supersededAt`). The only field allowed to leave the server is `_id` (used as a revocation handle).
- **`UserRecord`** – Storage-side shape: adds `password` (hashed), `deletedAt`, `inactivityWarnedAt`, 2FA fields, `tokens[]`, and redeclares timestamp fields as `Date` (contract uses ISO strings).
- **`UserDocument`** – `UserRecord` + `UserMethods` + Mongoose `Document` guarantees + `pendingImageKey`.
- **`UserMethods`** – `tokenAdd` / `tokenRemoveAll` instance methods.
- **`zodUserSchema`** – Zod wire-validation built on the orval-generated `CreateUserBody`. All error messages are thunks (`() => t(...)`) to defer i18n resolution past import time.
- **`userSchema`** – The Mongoose `Schema` with field definitions, regexes, defaults, and `select: false` on `password`.

## Relationships

- **`scripts/reap-inactive-accounts.ts`** – Stamps `inactivityWarnedAt` on first warning; reads it to distinguish its own soft-deletes from admin-initiated ones.
- **`src/infrastructure/i18n/index.ts`** – Provides `t()` used inside `zodUserSchema` error thunks.
- **`src/infrastructure/persistence/serialize.ts`** – `applySerialization` is imported to transform documents on read.
- **`src/modules/account/services/tokens.ts`** – Calls `hashToken`, `tokenAdd`, `tokenRemoveAll`; manages refresh/rotation lifecycle.
- **`src/modules/account/services/two-factor.ts`** – Reads/writes `twoFactorSecret`, `twoFactorLastUsedStep`, `twoFactorBackupCodes`; uses `hashToken` for backup codes.
- **`src/modules/account/services/authentication.ts`** – Consumes the `pre-save` bcrypt hook; selects `password` via `*WithCredentials` helpers for login.
- **`src/modules/account/services/verification.ts`** – Issues/consumes password-reset and verification tokens via `tokenAdd` / `tokenRemoveAll`.
- **`src/modules/account/session/jwt.ts`** – Imports `TokenType` to classify issued JWTs.
- **`src/modules/account/services/profile.ts`** – Reads/writes the self-service fields (`phone`, `website`, `locale`, `imageUrl`, `analyticsConsent`).
- **`src/modules/account/controllers/post-logout-everywhere.ts`** – Triggers `tokenRemoveAll` to revoke all sessions.
- **`src/modules/account/tests/integration/jwt.test.ts`** – Exercises token add/rotate/remove and `hashToken` through the model.
- **`src/modules/account/tests/integration/persisted-locale.test.ts`** – Asserts `locale` default and round-trip.
- **`src/modules/account/tests/integration/self-service.test.ts`** – Covers profile field edits against the schema.

## Notes

- **i18n thunk pattern is mandatory.** `zodUserSchema` evaluates at import time, before `i18next.init()`. An eager `t(...)` call returns `undefined` and Zod silently falls back to its English message. Always use `error: () => t(...)`.
- **`password` is `select: false`.** Any query that needs the hash must explicitly `.select('+password')` (the repository's `*WithCredentials` helpers). A plain `.find().lean()` will never return it.
- **`active` vs `deletedAt`.** These are independent tri-states; deactivation and soft-delete produce the same external effect but are distinct internal states. Backfilled by migration `20260808120000`.
- **Timestamp fields are `Date` in the document, ISO strings in the wire `User` contract.** The `UserRecord` interface redeclares them as `Date` to match what `timestamps: true` actually writes—don't type them as `string` in new code.
- **`supersededAt` keeps rotated refresh tokens in the array** for a short grace window (prevents two-tab race from looking like theft). Absent means the token is still live.
- **`Token['type']` is a plain string** in the stored subdocument; the `TokenType` enum only names the two JWT-layer kinds. The account-deletion token type appears in `tokens[]` but is not in the enum.
