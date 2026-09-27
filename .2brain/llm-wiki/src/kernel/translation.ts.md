---
source: src/kernel/translation.ts
sha256: 5397e19f177ab9402b22e932cc4dad17ab40da424efae57d535e9af5650d8ebd
generated_at: 2026-09-27T14:20:19.189261+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/translation.ts

## Purpose

Defines the **translation port**: a kernel-level hook that lets the read path resolve user-authored content (product titles, category descriptions) into the caller's language, and lets a hard delete of an entity cascade-delete its translation rows. It exists so that decorators over `createRepository` can depend on translation without importing `src/modules/*`, avoiding a circular dependency. The kernel declares the interface; `modules/locales` supplies the implementation at registration time.

## Key elements

- **`TranslationPort`** (interface) — the contract with six methods: `resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`. Registered once by `modules/locales`.
- **`TranslatedFields`** (type) — `Record<string, string>`; one entity's translated field values (e.g. `{ title, description }`). Absent key = untranslated.
- **`TranslationBatch`** (type) — input shape for upsert/delete: keyed by locale, value is `{ fields, origin? }` or `null` (delete).
- **`TranslationWriteSlot`** / **`TranslationWritePlan`** — the validated output of `plan`, consumed by `write`.
- **`registerTranslationPort(port?)`** — sets or clears the singleton port reference.
- **`resolveTranslations`** — read-path entry; returns an empty `Map` when unregistered.
- **`removeTranslations`** — hard-delete cascade entry; resolves to `0` when unregistered.
- **`searchTranslatedEntityIds`** — free-text search across translation rows; returns `[]` when unregistered.
- **`planTranslations`** — validation half of a write. Falls back to a monolingual (fallback-locale-only) plan when unregistered; rejects non-fallback locales or empty fallback with a 422.
- **`isTranslationPlan`** — type guard narrowing `TranslationWritePlan | ResponseReject`.
- **`writeTranslations`** — write half; no-op when unregistered.
- **`readAllTranslations`** — admin/editor read-all entry; empty `Map` when unregistered.
- **`isTranslationAvailable()`** — boolean check for UI affordances (e.g. language tabs).
- **`CORE_PERMISSION_KEYS`** — `['translations.any.read', 'translations.any.update']`, owned by `core` in `shared/authorization-keys.yaml`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — imports `t`, `getCurrentLocale`, `getFallbackLocale`, `localeCandidatesFor` for error messages and the fallback-locale fallback logic in `planTranslations`.
- **`src/infrastructure/http/response.ts`** — imports `generateReject` / `ResponseReject` to build 422 rejections in the unregistered fallback path.
- **`src/modules/locales/module.ts`** — calls `registerTranslationPort` inside its `onRegistered` hook, supplying the concrete implementation.
- **`src/modules/locales/services/translations.ts`** — the service that implements `TranslationPort` (resolves, writes, searches translation rows against its own repository).
- **`src/modules/products/service.ts`** — primary consumer: calls `resolveTranslations` on read, `planTranslations` + `writeTranslations` on write, and `removeTranslations` on hard delete.
- **`src/modules/orders/services/snapshot.ts`** — calls `resolveTranslations` to embed the product title in an order snapshot.
- **`src/app.ts`** — bootstraps module registration so `modules/locales` installs the port before request handling.
- **`tests/unit/kernel/translation.test.ts`** — unit-tests the fallback (unregistered) paths of `planTranslations`, `resolveTranslations`, `removeTranslations`, etc.
- **`src/modules/products/tests/integration/no-translation-provider.test.ts`** — verifies product CRUD works when `modules/locales` is absent (port unregistered).
- **`tests/cross-cutting/module-permissions.test.ts`** — asserts `CORE_PERMISSION_KEYS` appear in the declared permission list even without a `core` module.

## Notes

- **Unregistered is a valid state.** Every exported function degrades gracefully (empty map, zero, no-op) so callers never need to branch on whether `locales` is installed.
- **`plan` must precede `write`.** `writeTranslations` skips all validation; calling it without a prior `planTranslations` can corrupt data. Use `isTranslationPlan` to narrow before calling write.
- **`removeAll` is hard-delete only.** Soft deletes must never call it — a restored product with no translated name is the bug this port exists to prevent.
- **`search` receives an already-escaped pattern.** The caller is responsible for escaping; the implementation must not re-escape.
- **`localeCandidatesFor` is NOT in this file.** It lives in `@infrastructure/i18n` as pure locale-chain math with no port dependency.
- **`origin` on `TranslationBatch` is caller-facing only.** `TranslationWriteSlot` deliberately omits it; the `write` implementation supplies a default.
