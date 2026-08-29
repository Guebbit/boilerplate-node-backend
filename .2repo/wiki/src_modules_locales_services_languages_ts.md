# src/modules/locales/services/languages.ts

## Purpose

Service layer for the language (locale) lifecycle — creating, updating, and cascade-deleting a registered language — plus the two shared tenant-validation helpers (strict for writes, lenient for reads) that every other route in the locales module reuses.

## Key elements

- **`languageNotFound()`** – Shared 404 `ResponseReject` with the module's canonical "language not found" message.
- **`rejectUnknownTenant(tenant)`** – Write-path guard; returns a 422 reject if the tenant id is not in the known-tenant set, otherwise `undefined` (meaning "proceed").
- **`readableTenant(tenant?)`** – Read-path filter; returns the tenant if known, `undefined` otherwise (i.e. "no filter / every tenant").
- **`createLanguage(payload, context?)`** – Normalises the tag (`trim().toLowerCase()`), checks for an existing tag (409), persists a new `LocaleDocument`, and emits an `ADMIN_LOCALE_CREATED` audit event when a `CallerContext` is supplied.
- **`updateLanguage(tag, payload, context?)`** – Loads by tag (404 if absent), applies only the fields that are non-`undefined`, saves, and emits `ADMIN_LOCALE_UPDATED`.
- **`deleteLanguage(tag, context?)`** – Refuses with 409 while the language is still `active`; otherwise cascades deletion via the repository and emits `ADMIN_LOCALE_DELETED` with the removed-entry count.

## Relationships

- **`../repository`** (`localeRepository`) – All persistence calls (`findByTag`, `create`, `save`, `deleteLocaleCascade`) go through this singleton.
- **`../tenants`** (`isKnownTenant`) – Backs both `rejectUnknownTenant` and `readableTenant`.
- **`../audit`** (`localeAuditActions`) – Provides the action-constant strings passed to `buildAuditEvent`.
- **`../model`** – Supplies the `LocaleDocument` type used for persistence and return values.
- **`@infrastructure/http/response`** – `generateReject` / `generateSuccess` build every return value; the `ResponseReject` / `ResponseSuccess` types shape the public API.
- **`@infrastructure/http/request`** – `CallerContext` type is the optional audit-identity parameter on all three mutating functions.
- **`@infrastructure/observability/audit`** – `buildAuditEvent` + `emitAuditEvent` fire the audit trail.
- **`@infrastructure/i18n`** – `t()` provides localised error strings.
- **`@types`** – `LocaleDirection`, `CreateLocaleRequest`, `LocaleTenant`, `UpdateLocaleRequest` type definitions.
- **`services/index.ts`** – Barrel that re-exports this module so callers import from `@modules/locales/services`.

## Notes

- **Write vs. read tenant asymmetry is intentional.** Writes reject an unknown tenant (422) so no orphaned copy is stored; reads drop it (no filter) so a stale admin screen can still list languages. The two helpers live side-by-side in this file to keep the decision visible in one place.
- **`deleteLanguage` is two-step by design.** A 409 is returned if `active` is still `true`; the admin must deactivate first. This costs a toggle rather than irreversible work.
- **`updateLanguage` treats `undefined` as "unchanged."** Each field is individually guarded before assignment; a blanket spread would zero out fields the caller didn't touch.
- **Duplicate-tag race.** The app-level check gives a friendly 409; the database unique index (E11000) is the true guard for concurrent creates and is translated to the same 409 by the shared HTTP interpreter.
- **Audit emit is conditional.** When `context` is omitted (e.g. unit tests calling the helper directly), no audit event is produced.
