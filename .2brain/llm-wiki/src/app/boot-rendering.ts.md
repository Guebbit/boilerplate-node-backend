---
source: src/app/boot-rendering.ts
source_sha256: 2106a0b90cac75f147c5a4e1c5bb20addd8083c5aed0784daf7571e8b2709502
context_sha256: ba328f9c0dab698e779232f3fe2d94e2c1e11fec9e175152fac95c057b3dc371
generated_at: 2026-11-22T02:29:24.715290+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/boot-rendering.ts

## Purpose
Boots everything that turns a key into text a person reads: translation files, mail templates, and admin-edited copy overrides. The web app and every scheduled job call it, so a mail reads the same wherever it is built. It must run after `registerModules` (which installs the overlay reader via `locales`' `onRegistered`) and after the database connects (the overlay is read from the database).

## Key elements
- `bootRendering(): Promise<void>` is the only export. It runs three steps in order:
  1. `bootI18n(enabledModuleDirectories('locales'))` loads the translation files.
  2. `registerTemplateDirectories(enabledModuleDirectories('templates'))` registers the mail template directories.
  3. `refreshLocaleOverrides()` layers the admin's edits on top.

## Relationships
- `src/infrastructure/i18n` (`index.ts`, with `boot.ts` and `overrides.ts` behind it): supplies `bootI18n` and `refreshLocaleOverrides`.
- `src/infrastructure/adapters/mailer.ts`: supplies `registerTemplateDirectories`.
- `src/modules.ts`: supplies `enabledModuleDirectories`, which resolves each enabled module's `locales` and `templates` directories.
- `src/app/process-boot.ts` and `scripts/ops/prepare-job.ts`: neighbors in the dependency graph, presumably the web app and scheduled-job boot paths that call this function. The file itself only says that the web app and jobs boot it.
- `src/infrastructure/adapters/template-registry.ts`: a graph neighbor. This file does not reference it directly.

## Notes
- Order matters: the overlay patches the resources `bootI18n` just loaded, so the refresh must come last.
- The refresh never rejects, and an empty overlay is a valid state. It is awaited only to keep the ordering.
- Modules carry their own copy, so deleting a module deletes its strings. `infrastructure` sits below every module and cannot look them up, so the directory paths are passed in.
