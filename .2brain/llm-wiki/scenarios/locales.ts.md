---
source: scenarios/locales.ts
sha256: 696b9db38b7b0e9d42ede2d852a88e3c63007534db4294ea92fb66d44469cb97
generated_at: 2026-11-08T02:30:19.700139+00:00
model: ollama:qwen3.8:27b
---

# scenarios/locales.ts

## Purpose

Seed fixture module for the dynamic-locale tier of the demo dataset. Defines five languages (each exercising a distinct state: source/fallback, downloadable-only, deployed-and-overridable, inactive draft, and registered-but-empty) plus sixteen translated string entries, then wires them into the shop seed pipeline and the demo-history flow.

## Key elements

- **`SEED_LOCALE_TAGS`** — Named constants mapping role names (`source`, `downloadable`, `answerable`, `draft`, `empty`) to IETF tags. `source` is resolved via `getFallbackLocale()`; the rest are hardcoded tags.
- **`localeFixtures`** (exported) — Array of five `makeLocale` results, one per tag. `revision` is set explicitly (or omitted for the source/empty rows) because these bypass the repository's auto-bump.
- **`LOCALE_ENTRIES`** — Internal 16-tuple array of `[id, localeKey, app, key, value]` rows, grouped by demonstration purpose (Spanish frontend+backend, Italian backend, French draft).
- **`localeEntryFixtures`** (exported) — `LOCALE_ENTRIES` mapped through `makeLocaleEntry`, resolving the `app` field to a `backendApp()` or `frontendApp()` call.
- **`seedLocalesCollection`** — Async function that `Promise.all`s `insertIfAbsent` over both collections (languages first, then entries) and returns the combined `SeedOutcome[]`.
- **`driveLocaleEntryEdit`** — Accepts a `Caller` and issues a `PUT` to override the Italian `generic.error-unauthorized` entry, contributing one step to the demo audit-trail history.
- **`shopModule`** (exported) — Object with `seed`, `baseline: true`, and `driveHistoryEdit`, registered into the generated `shop-modules` table so `npm run regenerate` picks it up automatically.

## Relationships

- **`scenarios/seed.ts`** — Imports `insertIfAbsent` (idempotent insert helper) and the `SeedOutcome` type; this module's `seedLocalesCollection` returns an array of that type.
- **`src/modules/locales/factories.ts`** — Imports `makeLocale` and `makeLocaleEntry` to build the fixture objects.
- **`src/modules/locales/repository.ts`** — Imports `localeRepository` and `localeEntryRepository`, passed to `insertIfAbsent` during seeding.
- **`src/modules/locales/apps.ts`** — Imports `backendApp` and `frontendApp` to populate the `app` field on entries.
- **`src/infrastructure/i18n/index.ts`** (re-exporting from `catalog.ts`) — Imports `getFallbackLocale()` to resolve the `source` tag at runtime.
- **`scenarios/flows/client.ts`** — Imports the `Caller` type, used as the parameter for `driveLocaleEntryEdit`.
- **`scenarios/shop-modules`** (generated) — Consumes `shopModule` to register seeding and the history step in the `seedShop` pipeline.
- **`tests/cross-cutting/scenario-fixtures.test.ts`** — Consumes the exported fixtures to validate cross-cutting invariants (e.g., entry locale references resolve to a seeded language).
- **`src/modules/locales/tests/unit/service.test.ts`** — May import fixtures to exercise service-level logic against known locale states.

## Notes

- **Insertion order matters.** Languages are seeded before entries because an entry references its locale by tag; inserting entries first would create rows whose locale doesn't yet exist in the collection.
- **`revision` is manual here.** The normal repository `create`/`update` path bumps revision automatically; these fixtures set it (or omit it) explicitly to model the desired state without side-effects.
- **The `source` locale has no entries.** Its dictionary lives in a deployed `en.json` file, not in dynamic rows—deliberately different from the other four.
- **`shopModule` is the single coupling point** into the seed pipeline and the history flow. Deleting this file removes the module from the generated table entirely; there is no separate registration to clean up.
- **IDs are hand-assigned hex bands** per group (e.g., `…1001`–`…100a` for Spanish frontend, `…3001`–`…3002` for Spanish backend) and are not auto-generated; tests and other fixtures may reference them directly.
