---
source: src/kernel/translation.ts
sha256: 42a6f9c423ef0483e598ac593c5099bd1b5423f05a7cc567b454524dc871653c
generated_at: 2026-10-14T08:25:16.770357+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/translation.ts

## Purpose

Declares the translation **port** — a kernel-level abstraction that lets read paths resolve user-authored content (product titles, category descriptions) into a caller's language, lets a hard delete cascade translation rows, and exposes search and write-planning for translated fields. The kernel declares the contract; `modules/locales` registers the implementation. This mirrors the `AuthResolver` pattern in `kernel/authentication.ts`: a decorator over `createRepository` can depend on the port without importing `src/modules/*`, avoiding a cycle.

## Key elements

- **`TranslatedFields`** — `Record<string, string>`; one entity's resolved translated values. An absent key means untranslated, never `""`.
- **`TranslationFieldChanges`** — RFC 7396 merge-patch shape (`string` sets, `null` clears, absent leaves).
- **`clearOmittedFields(declared, stated)`** — converts a PUT into a full PATCH by filling every declared-but-omitted field with `null`.
- **`TranslationBatch`** — one or more locales for one entity; `null` value means delete that locale's row.
- **`TranslationPort`** (interface) — the contract `modules/locales` fulfils:
  - `resolve` — batch-resolve translated fields for multiple entities in one locale-aware query.
  - `removeAll` — hard-delete every locale's row for one entity (transaction-aware via `ClientSession`).
  - `search` — return entity ids whose translated fields match an already-escaped pattern.
  - `plan` — validate a write batch against the locales collection *without* writing.
  - `write` — apply an already-validated plan; never validates, never touches the entity's cache tag.
  - `readAll` — return every locale's row for one entity (admin/editor use).
- **`TranslationWriteSlot` / `TranslationWritePlan`** — the shape `plan` returns and `write` consumes.
- **`registerTranslationPort(port?)`** — sets (or clears) the active port; called once by `modules/locales`.
- **`resolveTranslations` / `removeTranslations` / `searchTranslatedEntityIds`** — thin entry points that no-op (empty map / 0 / `[]`) when no port is registered.
- **`isTranslationAvailable()`** — `true` once a port is registered.
- **`planTranslations`** — the public validate step. When unregistered, falls back to monolingual mode: only the fallback locale is accepted, anything else is a 422.
- **`isTranslationPlan`** — type guard narrowing `TranslationWritePlan | ResponseReject`.

## Relationships

- **`src/modules/locales/module.ts`** — calls `registerTranslationPort` in its `onRegistered` hook to supply the concrete `TranslationPort` implementation.
- **`src/modules/locales/services/translations.ts`** — implements the `TranslationPort` interface (the adapter side of this port).
- **`src/infrastructure/i18n/index.ts`** — provides `t`, `getCurrentLocale`, `getFallbackLocale`, and `localeCandidatesFor` imported here for fallback planning and locale-chain computation.
- **`src/infrastructure/http/response.ts`** — provides `generateReject` / `ResponseReject` used in `planTranslations`'s unregistered fallback and in the port's `plan` contract.
- **`src/infrastructure/persistence/versioning.ts`** — provides `carryVersion`, imported for use in the write path.
- **`src/modules/products/services/remove.ts`** — calls `removeTranslations` when a product is hard-deleted.
- **`src/modules/products/services/read.ts`** / **`lookups.ts`** — call `resolveTranslations` to hydrate translated fields on reads.
- **`src/modules/products/services/search.ts`** — calls `searchTranslatedEntityIds` to union translated-content matches into free-text search.
- **`src/modules/orders/services/snapshot.ts`** — calls `resolveTranslations` to capture translated product data into an order snapshot.
- **`src/app.ts`** — application bootstrap where `modules/locales` is registered, activating the port.

## Notes

- **Unregistered is a valid state.** Unit tests that never import `modules/locales` get no-op reads/writes/removals — callers must never branch on whether translation is wired up; the entry points already handle it.
- **`plan` and `write` are deliberately split** so a caller can create a new entity and its translations in the same request (e.g. `POST /products`) — `plan` runs before the entity row exists.
- **`removeAll` is hard-delete only.** A soft delete must *not* call it; a restored product with missing translations is the bug this separation prevents.
- **`localeCandidatesFor` is intentionally not in the port.** It is pure locale-chain arithmetic and lives in `@infrastructure/i18n` next to `getFallbackLocale`.
- **`search` receives an already-escaped pattern.** The caller (e.g. `products/services/search.ts`) escapes before invoking; the port implementation never sees raw user input.
