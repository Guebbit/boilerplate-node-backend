---
source: scenarios/locales.ts
sha256: 4669be6b87215d253453145ea6b4be702582f70c7e73c77b9d2478582fbd0f0e
generated_at: 2026-09-27T13:50:26.943514+00:00
model: ollama:qwen3.8:27b
---

# scenarios/locales.ts

## Purpose

Defines the dynamic-locale slice of the demo dataset: five languages, each pinned to a distinct state (source/fallback, downloadable-only, answerable/overlay, draft/inactive, empty), plus sixteen translated string entries that together exercise every code path in the locale and i18n infrastructure. Also exports the single demo-history step (an operator override write) that the shop flow calls to produce audit-trail entries.

## Key elements

- **`SEED_LOCALE_TAGS`** – `as const` map from semantic names (`source`, `downloadable`, `answerable`, `draft`, `empty`) to locale tags. `source` is resolved at runtime via `getFallbackLocale()`.
- **`localeFixtures`** – Five `makeLocale` objects, one per tag. Each is intentionally shaped to hit a different branch (no revision, inactive-with-entries, empty, etc.).
- **`LOCALE_ENTRIES`** – 16 tuples of `[id, locale, tenant, key, value]` covering frontend and backend tenants for Spanish and Italian, and a minimal pair for French.
- **`localeEntryFixtures`** – `LOCALE_ENTRIES` mapped through `makeLocaleEntry`, resolving tenant names to `backendTenant()` / `frontendTenant()` instances.
- **`seedLocalesCollection()`** – Async seeder that inserts all locales first, then all entries, via `insertIfAbsent`; returns combined `SeedOutcome[]`.
- **`driveLocaleEntryEdit(owner)`** – PUTs a new Italian value for a seeded backend entry, producing a visible audit-trail override. Called through `shopModules.locales.driveHistoryEdit`.

## Relationships

- **`src/modules/locales/factories.ts`** – Source of `makeLocale` and `makeLocaleEntry`, used to build every fixture object.
- **`src/modules/locales/repository.ts`** – Source of `localeRepository` / `localeEntryRepository`, the insert targets for `seedLocalesCollection`.
- **`src/modules/locales/tenants.ts`** – Provides `backendTenant()` / `frontendTenant()` used to resolve entry tenant fields.
- **`src/infrastructure/i18n/index.ts`** – Provides `getFallbackLocale()`, which determines the `source` tag at runtime.
- **`scenarios/seed.ts`** – Provides `insertIfAbsent` (idempotent insert helper) and the `SeedOutcome` return type.
- **`scenarios/flows/client.ts`** – Provides the `Caller` type used as the parameter of `driveLocaleEntryEdit`.
- **`scenarios/shop-modules.ts`** – Declares this module's `seedLocalesCollection` and `driveLocaleEntryEdit` in the `shopModules` registry so `seedShop` and the history flow can discover them.

## Notes

- **Ordering matters:** locales are seeded before entries because an entry references its locale by tag; inserting entries first would publish rows the manifest doesn't list.
- **`revision` is set explicitly** on non-source locales because these fixtures bypass the repository path that normally bumps it.
- **`driveLocaleEntryEdit` targets the `answerable` (Italian) entry specifically** — it is the only seeded language that has both a stored row and a deployed dictionary file, making the write a true override rather than a stray insert.
- **The step is wired through `shopModules`** rather than hardcoded in the flow; deleting this module removes the call site cleanly instead of leaving a dangling `/locales` 404.
- Entry IDs are hand-assigned hex strings in distinct bands per group (e.g. `…1001`–`…100a` for Spanish frontend, `…3001`–`…3002` for Spanish backend, `…3101`–`…3102` for Italian backend) rather than sequentially generated.
