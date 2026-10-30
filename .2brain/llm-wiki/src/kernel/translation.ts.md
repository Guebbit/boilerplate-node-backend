---
source: src/kernel/translation.ts
sha256: f2307e6f1244dce065496968285f5cde1e1cfd7c9a6f824f609b4331fa0a2a9a
generated_at: 2026-10-29T02:21:28.559585+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/translation.ts

## Purpose

Declares the **translation port**: the kernel's contract for resolving user-authored content (product titles, category descriptions) into a caller's language, and for cascading a hard-delete through an entity's translation rows. The kernel declares the hook; `modules/locales` registers a concrete implementation. This keeps `createRepository` decorators and other kernel code from importing `src/modules/*`, avoiding a circular dependency. Unregistered is a valid state — every entry-point degrades to a no-op.

## Key elements

- **`TranslationPort`** (interface) — the full contract: `resolve`, `removeAll`, `search`, `canPreviewDrafts`, `plan`, `write`, `readAll`, `readServed`.
- **`TranslatedFields`**, **`TranslationFieldChanges`**, **`TranslationBatch`** — shared type vocabulary for reads (locale-keyed field maps), RFC-7396 merge writes, and multi-locale batch payloads.
- **`TranslationWriteSlot`** / **`TranslationWritePlan`** — the validated intermediate that separates `plan` (validation, no write) from `write` (apply, no validation).
- **`registerTranslationPort`** — replaces the active port; called once from `modules/locales`' `onRegistered`.
- **`resolveTranslations`** — read-path entry; no-op (empty map) when unregistered or batch is empty.
- **`removeTranslations`** — hard-delete cascade entry; no-op (returns 0) when unregistered.
- **`searchTranslatedEntityIds`** — free-text search across translated fields; no-op (empty list) when unregistered.
- **`previewDraftTag`** — reads the ambient locale context to expose a draft-preview language tag, if the preview middleware set one.
- **`canPreviewDraftLanguages`** — delegates draft-read permission to the registered port; `false` when unregistered.
- **`isTranslationAvailable`** — simple boolean: whether a port is registered.
- **`planTranslations`** — validation half of a write; falls back to fallback-locale-only content when unregistered.
- **`writeTranslations`** (truncated in source) — apply half of a write; joins caller's transaction via `session`.

## Relationships

- **`src/modules/locales/module.ts`** — registers the concrete `TranslationPort` implementation at boot.
- **`src/modules/locales/services/translations.ts`** — implements every method on `TranslationPort`.
- **`src/infrastructure/i18n/index.ts`** (re-exports from `context.ts`, `catalog.ts`) — provides `t`, `getCurrentLocale`, `getFallbackLocale`, `getLocaleContext`, `localeCandidatesFor`; this file imports and re-exposes the latter two.
- **`src/kernel/middlewares/locale-preview.ts`** — binds the preview language into the locale context that `previewDraftTag` reads.
- **`src/infrastructure/http/response.ts`** — supplies `fieldError`, `generateReject`, `ResponseReject` used in validation rejection paths.
- **`src/infrastructure/persistence/versioning.ts`** — supplies `carryVersion` for optimistic-concurrency on translation rows.
- **`src/modules/products/services/read.ts`** / **`lookups.ts`** — call `resolveTranslations` and `searchTranslatedEntityIds` to hydrate or find products.
- **`src/modules/orders/services/snapshot.ts`** — calls `readServed` (or the port directly) to capture served-locale text into an order snapshot.
- **`src/app.ts`** — wires module registration so `modules/locales` gets a chance to call `registerTranslationPort`.
- **`scenarios/products.ts`** — test scenarios that exercise translation resolution through the port.

## Notes

- **Unregistered ≠ broken.** Every public entry-point returns a safe no-op (empty map / 0 / `false`) when no port is registered. Callers never need to branch on "is i18n wired up?"
- **`localeCandidatesFor` is NOT here.** Despite the import, the pure locale-chain computation lives in `@infrastructure/i18n` next to `getFallbackLocale`; this file only imports and passes it through.
- **`plan` vs `write` is a strict two-phase split.** `write` never validates and never touches the entity's cache tag or audit trail — the caller that wrote the entity owns those side-effects. Skipping `plan` before `write` can corrupt data.
- **`removeAll` is hard-delete only.** A soft-delete (the `deleted` flag flip) must NOT call this, because a restored product with no translated name is the exact bug the port exists to prevent.
- **`origin` is absent from `TranslationWriteSlot`.** That concept belongs to the generic "translator" write path; the entity-owner write path (e.g. an editor's product save) doesn't use it.
- **`draftTag` is request-scoped.** Workers and order-snapshot code paths (`runWithLocale`) never set it, so a draft language's text cannot leak into a message that outlives the request.
