---
source: src/modules/locales/services/languages.ts
sha256: 5c62eaa11010a840e6f925f7a3a71ac42d713290cb9921ddbfb27da1aa6eb0f4
generated_at: 2026-09-23T18:52:14.587264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/languages.ts

## Purpose

Service layer for the dynamic-tier language rows: create, update, and cascade-delete a locale. Also the single home of two cross-file guard rules — refusing writes under an unknown tenant and protecting the deployment's fallback locale from deactivation or deletion — so sibling services (entries, messages) can reuse them without duplicating the check.

## Key elements

- **`languageNotFound`** — shared 404 `ResponseReject` with the module's canonical not-found message; used by this file and importable by siblings.
- **`rejectFallbackLocale`** (internal) — returns a 409 reject when the tag equals `getFallbackLocale()`, preventing accidental loss of the source-of-truth locale.
- **`rejectUnknownTenant`** (exported) — returns a 422 reject when `isKnownTenant(tenant)` is false; the single enforcement point for the "no invisible copy" rule shared by other service files.
- **`createLanguage`** — trims/normalises the tag, checks for an existing tag (advisory; the unique index catches the race), persists via `localeRepository.create`, records an `ADMIN_LOCALE_CREATED` audit, returns 201.
- **`updateLanguage`** — per-field `undefined` guard so a partial payload leaves unset fields untouched; refuses deactivating the fallback locale; records `ADMIN_LOCALE_UPDATED` with only the `active` flag in metadata.
- **`deleteLanguage`** — requires the locale to already be inactive (two-step safeguard), refuses if it is the fallback, cascade-deletes entries + translations via `localeRepository.deleteLocaleCascade`, records `ADMIN_LOCALE_DELETED` with removed counts.

## Relationships

- **`src/modules/locales/repository.ts`** — all persistence (`findByTag`, `create`, `save`, `deleteLocaleCascade`) goes through `localeRepository`; this file holds no direct DB access.
- **`src/modules/locales/tenants.ts`** — calls `isKnownTenant` inside `rejectUnknownTenant`.
- **`src/modules/locales/audit.ts`** — reads `localeAuditActions` enum values to tag audit records.
- **`src/infrastructure/observability/audit.ts`** — calls `recordAudit`; when `context` is `undefined` (test callers) the emit is skipped.
- **`src/infrastructure/i18n/index.ts`** — barrel source for `getFallbackLocale` and `t` (i18n helpers).
- **`src/infrastructure/http/response.ts`** — all return shapes built via `generateSuccess` / `generateReject`.
- **`src/types/index.ts`** (barrel incl. `auth-context.ts`) — `LocaleDirection`, `CreateLocaleRequest`, `UpdateLocaleRequest`, `CallerContext`.
- **`src/modules/locales/services/index.ts`** — barrel that re-exports this module's public API to route handlers.
- **`src/modules/locales/model.ts`** — `LocaleDocument` type used in function signatures.

## Notes

- `context` is optional on every mutation; tests call these as plain helpers and simply omit it. Production route handlers always pass a real `CallerContext`.
- The duplicate-tag check in `createLanguage` is **advisory only** — it exists to produce a friendly 409 message. The real concurrency guard is the DB unique index (E11000 → 409 via the shared interpreter).
- `updateLanguage` deliberately tests each field against `undefined` rather than spreading the payload; a blanket assign would null out fields the caller did not send.
- Delete is intentionally two-step: the locale must be set `active: false` first, then deleted. This makes an accidental `DELETE` cost a deliberate toggle rather than days of translations.
- `rejectUnknownTenant` is **exported** (not just internal) so sibling service files import it from here instead of re-implementing the check.
