---
source: src/modules/locales/services/languages.ts
sha256: 7de3f38276df7f268bf98c6fa64dcdb64d30db465337f3a081f5b1f9d81ab1f8
generated_at: 2026-10-15T10:46:10.148963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/languages.ts

## Purpose

Service layer for the dynamic-locale CRUD lifecycle: registering a language, editing its display fields/visibility, and cascading-deleting it with all translated content beneath. Also hosts two shared write-path guards (unknown-app rejection, fallback-locale protection) that sibling service files import rather than re-implement.

## Key elements

- **`languageNotFound`** – Returns the module-wide 404 response shape; imported by other locale services for consistent phrasing.
- **`rejectFallbackLocale`** (internal) – Returns a 409 if the tag equals `getFallbackLocale()`, preventing deactivation or deletion of the deployment's source locale.
- **`rejectUnknownApp`** – Returns a 422 if `isKnownApp(app)` is false; the single rule shared by all write paths that scope data to an app id.
- **`createLanguage(payload, context?)`** – Normalises the tag, checks for an existing row (409), inserts via the repository, and emits an `ADMIN_LOCALE_CREATED` audit event. A concurrent same-tag insert is caught by a DB unique index (E11000 → 409).
- **`updateLanguage(tag, payload, context?)`** – Partial update: each field is applied only when present (`!== undefined`). Blocks deactivating the fallback locale. Emits `ADMIN_LOCALE_UPDATED`.
- **`deleteLanguage(tag, context?)`** – Refuses if the locale is still active (409) or is the fallback. Calls `deleteLocaleCascade`, emits `ADMIN_LOCALE_DELETED` with removed counts, then calls `refreshOverlay()`.

## Relationships

- **`@infrastructure/http/response`** – All return values are built with `generateSuccess` / `generateReject`; the function signatures use `ResponseSuccess<T>` / `ResponseReject`.
- **`@infrastructure/i18n`** – `t()` localises every user-facing error string; `getFallbackLocale()` supplies the guard's comparison target.
- **`@infrastructure/observability/audit`** – `recordAudit` fires the trail entry on each successful mutation (skipped when `context` is `undefined`).
- **`../apps`** – `isKnownApp` gates every write that is scoped to an application id.
- **`../audit`** – `localeAuditActions` provides the action constants used in audit records.
- **`../model`** – `normalizeTag` canonicalises the tag before any lookup; `LocaleDocument` is the domain shape returned to callers.
- **`../repository`** – All persistence (`findByTag`, `create`, `save`, `deleteLocaleCascade`) goes through `localeRepository`.
- **`./overlay`** – `refreshOverlay()` is invoked after a successful cascade delete to invalidate cached overlay state.
- **`../services/index.ts`** – Barrel file that re-exports this module's public API for route handlers.
- **`../tests/unit/service.test.ts`** – Unit-tests the three main functions, calling them without a `CallerContext` to exercise the no-audit path.

## Notes

- **Partial-update semantics:** `updateLanguage` tests each field against `undefined` before assigning. A blanket object-spread would silently clear fields the caller didn't touch.
- **Optional `context`:** When omitted (as in unit tests), `recordAudit` is a no-op. Production routes always pass a `CallerContext`.
- **Two-step delete:** A language must be deactivated (`active: false`) before `deleteLanguage` will proceed. This is an intentional safeguard against an accidental `DELETE` destroying translated content.
- **Race on create:** The explicit `findByTag` check gives a clean 409 message; the DB unique index is the backstop for true concurrency. Both resolve to 409.
- **`refreshOverlay` is delete-only:** Creating or updating a language does not trigger an overlay refresh.
