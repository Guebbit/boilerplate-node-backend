# src/modules/users/model.ts

## Purpose

Defines the Mongoose schema, Zod wire-validation twin, and token subdocument methods for the user record. Kept as a single file deliberately: splitting it would separate the bcrypt pre-save hook from the `select: false` that prevents the password hash from leaking on any read.

## Key elements

- **`TokenType`** — enum (`REFRESH`, `PASSWORD_RESET`) naming the two token types the JWT layer recognises.
- **`Token`** — interface for a token subdocument (`token`, `type`, `expiration?`, `lastUsedAt?`, plus the Mongoose-assigned `_id`).
- **`UserRecord` / `UserDocument` / `UserMethods` / `UserModel`** — TypeScript type layer bridging the wire `User` contract (ISO-string dates) to the Mongoose document (real `Date`s), instance methods (`tokenAdd`, `tokenRemoveAll`), and the model type.
- **`zodUserSchema`** — Zod schema extending the orval-generated `CreateUserBody` with i18n-aware validation messages for `email`, `username`, and `password`.
- **`userSchema`** — the Mongoose schema: all user fields, `timestamps: true`, indexes, the bcrypt pre-save hook, and atomic token `$push`/`$pull` methods.
- **Indexes** — `users_email` (unique) and `users_tokens_token`. Explicitly *not* indexed: `deletedAt`.

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `index.ts`) — `zodUserSchema` imports `t` to build per-locale error messages.
- **`@infrastructure/persistence/serialize.ts`** — the model's output is expected to pass through `applySerialization` / `applyUserTransform` before reaching a controller.
- **`src/modules/account/session/jwt.ts`** — consumes `TokenType` to issue/verify refresh and password-reset JWTs.
- **`src/modules/account/services/authentication.ts`** — reads the schema's `password` (via `*WithCredentials` helpers) and calls `tokenAdd`/`tokenRemoveAll` on login and logout.
- **`src/modules/account/services/verification.ts`** — issues and consumes `PASSWORD_RESET`-type tokens stored in `tokens`.
- **`src/modules/account/services/profile.ts`** — reads/writes the profile fields defined here (`username`, `phone`, `website`, `locale`, `imageUrl`, `thumbnailUrl`).
- **`src/modules/account/services/tokens.ts`** — manages the `tokens` array (revoke-all, list sessions).
- **`src/modules/account/controllers/post-logout-everywhere.ts`** — triggers `tokenRemoveAll` across all refresh types.
- **`scripts/backfill-image-thumbnails.ts`** — writes `thumbnailUrl` and clears `pendingImageKey` on existing rows.
- **Integration tests** (`jwt.test.ts`, `persisted-locale.test.ts`, `self-service.test.ts`, `service-flows.test.ts`, `service.test.ts`) — exercise the schema, token methods, and serialization end-to-end.

## Notes

- **Zod messages are thunks** (`error: () => t(...)`), never eagerly called. This module is evaluated at import time, before `i18next.init()` runs in `app.ts`; an eager call would return `undefined` and Zod would silently fall back to its own English default.
- **`password` and `tokens` are both `select: false`.** Even a `.lean()` read bypasses `applyUserTransform`, so the schema-level exclusion is the last line of defence. Use the repository's `*WithCredentials` helpers to re-select.
- **Token writes are atomic** (`$push`/`$pull` evaluated by mongod), never read-modify-write, to avoid lost-session races under concurrent logins.
- **Index names are load-bearing.** Mongo identifies an index by name as much as by key; renaming one here will make a database holding the old name fail at boot rather than silently no-op.
- **`active` and `verified` are independent of `deletedAt`.** Deactivation and soft-delete are separate states; admin listings filter on `active`, not `deletedAt`.
- **`createdAt`/`updatedAt` are redeclared as `Date`** in `UserRecord` because the wire contract carries ISO strings but `timestamps: true` writes real `Date` objects.
- **`deletedAt` is deliberately not indexed** — nothing searches on it; the one login query that references it also matches on the unique, indexed `email`.
