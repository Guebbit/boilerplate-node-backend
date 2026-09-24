---
source: src/modules/locales/services/messages.ts
sha256: 16b4f4663d00542822cd93aa475b0e754c4fce8002a8c7252624fb421f29cafd
generated_at: 2026-09-23T18:52:25.237231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/messages.ts

## Purpose

Provides the two read paths for stored locale overrides: one that a frontend client downloads per language, and one that the API's i18n provider calls to rebuild its backend overlay. Both expand flat key-value rows through `buildMessageTree`, differing only in which tenant's keyspace they serve.

## Key elements

- **`readMessages(tag, tenant?)`** – Returns a frontend tenant's message tree for a single language tag, wrapped in a `generateSuccess` envelope. Defaults `tenant` to `frontendTenant()`. Returns a 404 (`languageNotFound`) for backend tenants, unconfigured ids, or inactive languages.
- **`readApiOverrides()`** – Returns every backend-tenant override grouped by language and expanded into trees. Includes inactive languages deliberately. Catches per-locale `buildMessageTree` failures so one bad dictionary does not abort the whole refresh.

## Relationships

- **`src/modules/locales/services/keys.ts`** – Supplies `buildMessageTree`, the shared routine both reads use to turn flat rows into nested objects.
- **`src/modules/locales/services/languages.ts`** – Supplies `languageNotFound`, the 404 response used by `readMessages`.
- **`src/modules/locales/tenants.ts`** – Supplies `backendTenant`, `frontendTenant`, and `isFrontendTenant` for tenant scoping and validation.
- **`src/modules/locales/repository.ts`** – Supplies `localeRepository.findByTag` (language lookup + active flag) and `localeEntryRepository.listEntries` / `listEntriesByTenant` (row retrieval).
- **`src/infrastructure/http/response.ts`** – Provides `generateSuccess` and the `ResponseSuccess` / `ResponseReject` types for the HTTP envelope.
- **`src/infrastructure/adapters/logger.ts`** – `logger.warn` is called in the per-locale catch block of `readApiOverrides`.
- **`src/types/index.ts`** – Provides the `LocaleMessages` and `LocaleTenant` type imports.
- **`src/modules/locales/services/index.ts`** – Barrel file that re-exports the public surface of this module.

## Notes

- `readMessages` returns **404, not 403 or an empty 200**, for inactive languages so the response does not reveal that a draft translation exists.
- `readApiOverrides` **includes inactive languages on purpose**: the `active` flag governs public visibility, and excluding a draft backend override would silently revert API copy mid-translation.
- The per-locale `try/catch` in `readApiOverrides` is paired with an `eslint-disable no-restricted-syntax` comment and Stryker mutation-testing disable/restore markers—intentional, not accidental.
- A key that is simultaneously a leaf string and a group causes `buildMessageTree` to throw; that is the only error path caught here.
