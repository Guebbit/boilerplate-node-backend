# src/modules/locales/services/languages.ts

## Purpose

Service-layer CRUD for language records: registering a new language, editing its display/visibility fields, and deleting it with a cascade. Also the single home for the module's shared tenant-validation rules — strict rejection on writes (422) versus silent drop on reads (treat as "no filter").

## Key elements

- **`languageNotFound()`** — Shared 404 `ResponseReject` with a single localized message; every route in the module uses this one phrasing.
- **`rejectUnknownTenant(tenant)`** — Write-path guard. Returns a 422 reject if the tenant id isn't registered in this deployment; returns `undefined` (meaning "proceed") if it is.
- **`readableTenant(tenant?)`** — Read-path counterpart. Returns the tenant id only if it is known; otherwise `undefined`, which callers interpret as "filter by nothing / show all tenants."
- **`createLanguage(payload, context?)`** — Validates the tag is new (409 if it exists), inserts via `localeRepository.create`, returns 201. Emits an `ADMIN_LOCALE_CREATED` audit event when `context` is supplied.
- **`updateLanguage(tag, payload, context?)`** — Fetches by tag, applies each field only if the caller provided it (`!== undefined`), saves, returns 200. Emits `ADMIN_LOCALE_UPDATED` with `active` in metadata.
- **`deleteLanguage(tag, context?)`** — Refuses with 409 if the language is still `active`. Otherwise calls `localeRepository.deleteLocaleCascade` and returns the count of removed entries. Emits `ADMIN_LOCALE_DELETED`.

## Relationships

- **`@types`** — Source of `LocaleDirection`, `CreateLocaleRequest`, `LocaleTenant`, `UpdateLocaleRequest`.
- **`@infrastructure/i18n`** — `t()` for every user-facing error string in this file.
- **`@infrastructure/http/response`** — `generateReject` / `generateSuccess` and the `ResponseReject` / `ResponseSuccess` union types that every function returns.
- **`@infrastructure/http/request`** — `CallerContext` type (optional param on all three CRUD functions).
- **`../model`** — `LocaleDocument` shape used when constructing and mutating the persisted record.
- **`../repository`** — `localeRepository` provides `findByTag`, `create`, `save`, `deleteLocaleCascade`.
- **`../tenants`** — `isKnownTenant` is the sole check behind both `rejectUnknownTenant` and `readableTenant`.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` / `buildAuditEvent` for the three admin audit actions.
- **`../audit`** — `localeAuditActions` enum values (`ADMIN_LOCALE_CREATED/UPDATED/DELETED`).

## Notes

- **Write/read tenant asymmetry is intentional.** Writes get a 422 because storing copy under an unknown tenant would make it invisible to every consumer; reads silently widen to "all tenants" so a bad query-string param never blanks the UI.
- **`updateLanguage` is field-wise, not a bulk assign.** Each property is tested against `undefined` before assignment so that a partial update never zeroes out fields the caller omitted.
- **Delete is two-step by design.** The caller must set `active: false` first; the 409 on an active language is the guard against an accidental `DELETE` destroying translated content.
- **Duplicate-tag race.** `createLanguage` checks `findByTag` for a friendly 409, but the real guarantee is a DB unique index — a concurrent insert that slips past the check surfaces as `E11000`, which the shared error interpreter maps to 409 as well.
- **Audit is conditional.** All three CRUD functions skip the audit emit when `context` is `undefined`, which is how tests exercise the logic as a plain helper without requiring an HTTP caller.
