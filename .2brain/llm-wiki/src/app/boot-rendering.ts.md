---
source: src/app/boot-rendering.ts
sha256: 959c17ad4c60fe1473e481eee6d9f8f27867f8b2c60a30e4893af6d5831e9699
generated_at: 2026-11-14T17:47:45.484424+00:00
model: ollama:qwen3.8:27b
---

# src/app/boot-rendering.ts

## Purpose

Boots the "rendering" layer: translation files, mail templates, and admin-edited overlay copy. Both the web app and every scheduled job call it so that a mail reads identically regardless of where it is built.

## Key elements

- **`bootRendering(): Promise<void>`** — Orchestrates a three-step sequence:
  1. `bootI18n(enabledModuleDirectories('locales'))` — loads per-module translation files.
  2. `registerTemplateDirectories(enabledModuleDirectories('templates'))` — registers mail template directories.
  3. `refreshLocaleOverrides()` — layers admin edits (stored in the DB) on top of the loaded resources.

## Relationships

- **`src/infrastructure/i18n/boot.ts`** — provides `bootI18n`, the function that loads locale resources.
- **`src/infrastructure/i18n/overrides.ts`** — provides `refreshLocaleOverrides`, which reads the admin overlay from the database and patches loaded resources.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export of the above; the import source for this file.
- **`src/infrastructure/adapters/mailer.ts`** — provides `registerTemplateDirectories`, which wires template paths into the mailer.
- **`src/infrastructure/adapters/template-registry.ts`** — internal store consumed by `registerTemplateDirectories`.
- **`src/modules.ts`** — provides `enabledModuleDirectories`, which resolves the `locales/` and `templates/` sub-paths of each enabled module.
- **`src/app.ts`** — calls `bootRendering` during web-app startup.
- **`scripts/ops/prepare-job.ts`** — calls `bootRendering` before executing a scheduled job, ensuring jobs see the same copy.

## Notes

- **Order is contractual.** `refreshLocaleOverrides` patches the resources `bootI18n` just loaded; running it before or independently of `bootI18n` would be a no-op or error.
- **Must run after two prerequisites:** (1) `registerModules` has fired (the overlay reader is installed by the `locales` module's `onRegistered` hook) and (2) the database connection is live (the overlay is read from it).
- **`refreshLocaleOverrides` never rejects.** An empty overlay is a valid state; the `.then()` chain awaits it purely for ordering, not for error handling.
- **Modules own their copy.** Because `infrastructure` sits below modules in the dependency graph, it cannot discover module paths on its own; `enabledModuleDirectories` hands them in explicitly. Deleting a module therefore removes its strings and templates automatically.
