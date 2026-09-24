---
source: src/modules/locales/module.ts
sha256: 4977695d1953e9723b2b7ce7d3d81c87ad8ee3867bd77fc279db59fdc616afe7
generated_at: 2026-09-23T18:50:17.839547+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/module.ts

## Purpose

Module entry point for the `locales` module. At import time it wires the module's services, repository, and routes into the app's registries (translation port, locale-override provider) and exposes the manifest that `app.ts` consumes. It is the single file outside the module that may import its internals, enforcing the "reaches i18n only through `@infrastructure/i18n`" boundary.

## Key elements

- **`setTranslatables`** (re-exported from `localeService`) — the only symbol the `app` tier may pull from this module; hands `resolveTranslatables`'s result to a caller that cannot reach `services/index.ts` directly.
- **`registerLocaleOverrideProvider(…)`** (side-effect at import) — registers `localeService.readApiOverrides` with `@infrastructure/i18n` so admin-entered overrides reach `t()` on refresh.
- **`registerTranslationPort(…)`** (side-effect at import) — binds the module's repository/service functions to the five translation-port methods (`resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`).
- **Default export** (`AppModule`) — manifest: name `locales`, `basePath: '/locales'`, permission keys, `routes` (from `./routes`), `locales` directory path (for the module's own i18n strings), and `personalData: 'none'`.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type this manifest `satisfies`.
- **`src/kernel/translation.ts`** — source of `registerTranslationPort`, called here at import time.
- **`src/infrastructure/i18n/index.ts`** — source of `registerLocaleOverrideProvider`, called here at import time.
- **`src/app.ts`** — the only external consumer of `setTranslatables`; also the tier that hands this file the `translatables` lookup it cannot collect itself.
- **`src/modules/locales/routes.ts`** — imported as `router` and placed in the manifest.
- **`src/modules/locales/services/index.ts`** — imported as `localeService`; provides both `setTranslatables` and the override-read function.
- **`src/modules/locales/repository.ts`** — imported as `translationRepository`; supplies `resolve`, `removeAll`, `search`, and `readAll` implementations for the port.
- **`src/modules/locales/services/translations.ts`** — imported as `planForPort` / `writeForPort` for the `plan`/`write` port methods.
- **`src/modules.ts`** — the module collection that includes this module's default export.
- **`tests/integration/app/demo-routes.test.ts`**, **`tests/integration/scenarios/shop.test.ts`** — exercise routes and translation-port behavior registered through this file.

## Notes

- **Two tiers, no merge:** deployed locale files load into i18next at boot; runtime overrides (one row per language/tenant/key) are owned here. Neither is awaited on the request path, so a DB outage degrades to a stale overlay only.
- **No `index.ts` by design:** this file *is* the only path the `module-internals-are-private` depcruise rule permits to outside callers.
- **Import-time registration, not a manifest field:** the override provider and translation port are installed by side-effect here (same pattern as `audit-logs` installing its sink), so `app.ts` never needs to know which module fills them.
- **`personalData: 'none'`:** `translatedBy` is a staff user-id pointer set from `context?.caller.id`; it is never reachable via `POST /account/export`.
