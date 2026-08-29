# src/modules/users/model.ts

## Purpose

Single-file definition of the user record: Mongoose schema, Zod wire validation, token subdocument shape, and document-level methods. It deliberately keeps the password-hash hook, `select: false` guards, token methods, and Zod schema co-located so that the storage contract, the wire contract, and the credential-protection invariant live in one readable unit.

## Key elements

- **`TokenType`** — enum naming the two token kinds the JWT layer recognises (`refresh`, `password`).
- **`Token`** — interface for the token subdocument; `_id` is the only field safe to expose externally (used as the revocation handle). `lastUsedAt` tracks refresh-token exchanges for idle-vs-active session display.
- **`UserRecord` / `UserDocument` / `UserMethods` / `UserModel`** — typed layer stack: contract → document (with `password: string`, `tokens: Token[]`) → instance methods (`tokenAdd`, `tokenRemoveAll`) → Mongoose `Model` type.
- **`zodUserSchema`** — extends the orval-generated `CreateUserBody`; overrides `email`, `username`, `password` with i18n-aware error thunks. Used for request-body validation.
- **`userSchema`** (Mongoose) — fields: `email` (unique index), `username`, `password` (`select: false`), `imageUrl`, `locale`, `admin`, `active`, `verified`, `tokens` (array, `select: false`), `deletedAt`. `timestamps: true`.
- **Index declarations** — `users_email` (unique, named explicitly to match existing deployments); a second index for refresh-token lookup (truncated in source).

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `index.ts`) — provides the `t()` function; every Zod error message is a *thunk* (`() => t('…')`) so translation resolves at parse time, after `i18next.init()` has run and the request locale is set.
- **`@infrastructure/persistence/serialize.ts`** — `applySerialization` is imported to convert stored `Date` fields to ISO strings on read, reconciling the document (`Date`) with the wire contract (`string`).
- **`@modules/account/session/jwt.ts`** — consumes the `TokenType` enum and the `tokens` array to issue/verify JWTs and refresh tokens.
- **`@modules/account/services/tokens.ts`** — calls `tokenAdd` / `tokenRemoveAll` instance methods.
- **`@modules/account/services/verification.ts`** — reads/writes the `verified` boolean after the confirm-email flow.
- **`@modules/account/services/authentication.ts`** — selects `password` via the repository's `*WithCredentials` helpers for login hashing.
- **`@modules/account/services/profile.ts`** — reads/writes `locale`, `username`, `imageUrl`, etc.
- **`@modules/account/controllers/post-logout-everywhere.ts`** — triggers `tokenRemoveAll` to revoke all refresh tokens on a user.
- **Test files** (`jwt.test.ts`, `persisted-locale.test.ts`, `self-service.test.ts`, `service-flows.test.ts`, `service.test.ts`, `session-jwt.test.ts`) — exercise the schema, token methods, and Zod validation in integration and unit contexts.

## Notes

- **`select: false` on `password` and `tokens`** — both are excluded from every read by default. A `.lean()` query still cannot leak them unless it explicitly re-selects. Use the repository's `*WithCredentials` helpers.
- **Zod error messages must be thunks** (`() => t('…')`), never bare `t('…')`. The module is evaluated at import time, before `i18next.init()`; an eager call returns `undefined` and Zod falls back to English.
- **Index names are load-bearing** — they are pinned to match existing production databases. Renaming an index causes a Mongo index-options conflict and the app fails to boot.
- **`email` unique index is a correctness guard** — signup is check-then-insert; only the DB constraint prevents a race. The `E11000` handler in `@infrastructure/http/errors` maps the duplicate to a 409.
- **`active` and `deletedAt` are independent** — deactivation ≠ soft-delete. Non-admin visibility requires both `active: true` AND `deletedAt: undefined`.
- **`locale` is not validated against a supported list** — a dropped locale must not make an existing user unreadable; `getFixedT` falls back per-key.
- **`verified` defaults to `false`** (self-signup path) but existing rows were backfilled to `true` by migration `20260813090000`. No server-side guard reads it; it is informational for the client.
