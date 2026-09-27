---
source: src/modules/locales/services/languages.ts
sha256: 35200f6417aec14434474eeeeff65af7fa745252a2fba7437ecf3423c1cb23e6
generated_at: 2026-09-27T15:01:24.876532+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/languages.ts

## Purpose

Service layer for language (locale) CRUD — creating, editing, and deleting language rows plus their cascaded entries/translations. Also the shared home for two cross-service validation rules: refusing writes under an unknown tenant and protecting the deployment's fallback locale from deactivation or deletion.

## Key elements

- **`languageNotFound`** — Exported factory returning the module-standard 404 reject response.
- **`rejectFallbackLocale`** — Internal guard; returns a 409 reject if the tag equals the deployment's fallback locale.
- **`rejectUnknownTenant`** — Exported guard; returns a 422 reject if the tenant is not in the known-tenant set. Shared by other service files (entries, messages) for write-path validation.
- **`createLanguage(payload, context?)`** — Validates tag uniqueness, inserts a new `LocaleDocument`, records an `ADMIN_LOCALE_CREATED` audit entry, returns 201.
- **`updateLanguage(tag, payload, context?)`** — Applies only fields present in the payload (per-field `!== undefined` checks), guards fallback deactivation, records `ADMIN_LOCALE_UPDATED`.
- **`deleteLanguage(tag, context?)`** — Refuses if the language is still active (409) or is the fallback; cascades entries and translations, records `ADMIN_LOCALE_DELETED`, calls `refreshOverlay()`.

## Relationships

- **`@infrastructure/i18n`** — `getFallbackLocale()` identifies the protected locale; `t()` supplies human-readable error strings.
- **`@infrastructure/http/response`** — `generateReject` / `generateSuccess` build the response envelopes.
- **`@infrastructure/observability/audit`** — `recordAudit` emits the structured audit trail (only when `context` is provided).
- **`src/modules/locales/audit.ts`** — `localeAuditActions` enum for action identifiers.
- **`src/modules/locales/model.ts`** — `normalizeTag` and the `LocaleDocument` type.
- **`src/modules/locales/repository.ts`** — `localeRepository` for all reads/writes and cascade delete.
- **`src/modules/locales/tenants.ts`** — `isKnownTenant` backing `rejectUnknownTenant`.
- **`src/modules/locales/services/overlay.ts`** — `refreshOverlay` invalidates the cached overlay after a language is removed.
- **`@types`** — `LocaleDirection`, `CreateLocaleRequest`, `UpdateLocaleRequest`, `CallerContext`.

## Notes

- **Partial-update semantics:** `updateLanguage` tests each field against `undefined` before assignment. A blanket object-assign would wipe fields the caller did not intend to change.
- **Optional `context`:** When omitted (e.g., in unit tests), `recordAudit` is a no-op. Production routes always pass a `CallerContext`.
- **Two-step delete:** A language must be deactivated (`active: false`) before it can be deleted. This is the sole safeguard against accidental cascade destruction.
- **Race on create:** The pre-check for an existing tag is for the error message; the actual concurrency guard is a DB unique index whose `E11000` is mapped to 409 by the shared response interpreter.
- **`refreshOverlay` is only called on delete.** Create and update do not invalidate the overlay cache.
