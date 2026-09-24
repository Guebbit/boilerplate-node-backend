---
source: src/kernel/translation.ts
sha256: b64d9097fa224bc28c039f92aaaa800af4afb497c5870f8c9283e56427d2a1bc
generated_at: 2026-09-23T17:56:37.110329+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/translation.ts

## Purpose

Declares the **translation port** — a kernel-level hook that lets the read path resolve user-authored content (product titles, category descriptions) into the caller's language, and lets a hard delete cascade its translation rows — without the kernel importing from `src/modules/*`. `modules/locales` registers a concrete implementation at import time, mirroring how `kernel/authentication.ts`'s `AuthResolver` is supplied by the `account` module. This inversion prevents a circular dependency between the kernel and the locales module.

## Key elements

- **`TranslationPort`** (interface) — the contract `modules/locales` fulfils. Methods: `resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`.
- **`TranslatedFields`** — `Record<string, string>`; absent key means untranslated (never `""`).
- **`TranslationWriteSlot`** / **`TranslationWritePlan`** — the shape `plan` returns and `write` consumes; a batch of per-locale upsert-or-delete slots plus the fallback locale.
- **`registerTranslationPort(port?)`** — replaces the module-level port (or clears it with `undefined`).
- **`resolveTranslations`** — read-path entry; returns an empty `Map` when unregistered or batch is empty.
- **`removeTranslations`** — hard-delete entry; returns `0` when unregistered.
- **`searchTranslatedEntityIds`** — search entry; returns `[]` when unregistered.
- **`planTranslations`** — validation half of a write. **Hard-fails (500) when unregistered** — the only entry point that does not silently no-op.
- **`isTranslationPlan`** — type guard narrowing `TranslationWritePlan | ResponseReject`.
- **`writeTranslations`** — applies a pre-validated plan; no-op when unregistered. Does **not** validate, does **not** touch cache tags or audit.
- **`readAllTranslations`** — admin/editor read of all locales for one entity.
- **`Translatable`** — minimal `{ id: string }` constraint for `applyTranslations` items.
- **`applyTranslations`** — convenience that calls `resolveTranslations` with the ambient locale chain, then spreads resolved fields onto wire-shaped items. Returns a new array; items with no translation row are returned by reference.

## Relationships

- **`src/infrastructure/i18n/index.ts`** (re-exports from `catalog.ts`, `context.ts`) — provides `t`, `getCurrentLocale`, `localeCandidatesFor`. `localeCandidatesFor` is pure locale-chain math kept in infrastructure by design; this file never re-implements it.
- **`src/infrastructure/http/response.ts`** — provides `generateReject` and the `ResponseReject` type used by `planTranslations`'s error path and the `isTranslationPlan` guard.
- **`src/types/index.ts`** — provides the `UpsertTranslationsRequest` shape that `plan` validates against.
- **`src/modules/locales/module.ts`** — calls `registerTranslationPort` at import time, supplying the concrete implementation backed by `src/modules/locales/services/translations.ts`.
- **`src/modules/products/service.ts`** — primary consumer; calls `resolveTranslations` / `applyTranslations` on read, `removeTranslations` on hard delete, and `planTranslations` + `writeTranslations` on write.
- **`src/modules/orders/services/snapshot.ts`** — calls `applyTranslations` when serializing product snapshots into orders.
- **`scenarios/products.ts`**, **`src/modules/orders/tests/unit/snapshot.test.ts`**, **`tests/unit/kernel/translation.test.ts`** — exercise the port either through a registered fake or by verifying the unregistered no-op paths.

## Notes

- **`planTranslations` is the only non-silent entry point.** Every other function returns a safe empty value (empty map, zero, empty array) when unregistered. `plan` deliberately throws a 500 because a caller that reaches it intends to _write_; silently "validating" with no backend would corrupt data.
- **`applyTranslations` requires wire-shaped items, not Mongoose documents.** Spreading over a hydrated document would clobber virtuals (`available`), `_id`→`id` mapping, and date serialization. Callers must `.toJSON()` first.
- **`removeAll` is hard-delete only.** A soft-delete flag flip never triggers it, because a restored product with missing translations is exactly the bug this port prevents.
- **`write` never validates.** A caller that skips `plan` can write corrupted rows. The split is intentional so a caller writing its own entity document can interleave cache-tag and audit updates around the write in a single operation.
- **`localeCandidatesFor` deliberately lives in `@infrastructure/i18n`, not here.** It is a pure function with no port or registration concerns.
- **Unregistered state is a valid runtime state.** Unit tests that never import `modules/locales` exercise the no-op paths by design.
