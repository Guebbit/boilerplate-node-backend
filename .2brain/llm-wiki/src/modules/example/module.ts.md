---
source: src/modules/example/module.ts
generated_at: 2026-11-22T05:09:42.368770+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/module.ts

## Purpose
The manifest for the `example` module: a small "note" domain (owner, draft/published/archived life) that exists to be copied when starting a new domain and deleted once you have your own. It declares everything the module asks the application to do; each optional capability is one manifest entry plus its own files and can be removed independently. It depends on `users` (via its barrel) for the owner's name, and nothing depends on it.

## Key elements
- **`publicEvents`** (local const): maps `EXAMPLE_PUBLISHED` to a `PublicEventTarget` whose `toPublicEvent` yields `{ eventType: 'example.published', data: { exampleId, title } }` for webhooks.
- **Default export** (`satisfies AppModule`): the manifest, with these entries:
  - `name: 'example'`
  - `mounts`: the `router` at `/examples`
  - `config`: `[exampleConfig.slice]`
  - `rateLimits`: `exampleRateLimits`
  - `publicEvents`
  - `subscribe`: registers `mailOwnerOfPublished` on `EXAMPLE_PUBLISHED` via `onDomainEvent`
  - `imageTargets`: `EXAMPLE_IMAGE_COLLECTION` → `exampleRepository.writebackImage`
  - `translatables`: the `example` entry (collection and cache tag `'examples'`, spread of `exampleRepository.translatable`, `exampleTranslationFieldRules`)
  - `personalData`: section `'examples'`, with `collect` = `collectPersonalData` and `erase` delegating to `eraseForUser(userId, session)`
  - `locales` and `templates`: the `locales` and `templates` directories next to this file

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` and `PublicEventTarget` types. The registry is how `webhooks` projects public events without importing this module by name.
- `src/kernel/events.ts`: supplies `onDomainEvent` and `DomainEventMap` (types the webhook payload). The `EXAMPLE_PUBLISHED` event is imported from the module's own `./events.ts` (see `src/modules/example/events.ts`).
- `src/modules.ts`: the module list that presumably loads this manifest. Not shown in this file.
- `src/modules/example/config.ts`, `src/modules/example/rate-limits.ts`, `src/modules/example/model.ts` and `src/modules/example/repository.ts`: provide the config slice, rate limits, translation field rules, and repository hooks (`writebackImage`, `translatable`). The router comes from `src/modules/example/routes.ts`.
- `src/modules/example/events.ts`: provides the `EXAMPLE_PUBLISHED` event.
- `src/modules/example/services/notify.ts`: provides the subscriber `mailOwnerOfPublished`.
- `src/modules/example/services/cover.ts`: provides `EXAMPLE_IMAGE_COLLECTION`.
- `src/modules/example/services/personal-data.ts`: provides the export (`collectPersonalData`) and erasure (`eraseForUser`) handlers.
- `src/modules/delivery/module.ts`: a sibling manifest. This file does not reference it.
- `src/modules/example/tests/unit/manifest.test.ts` and `src/modules/example/tests/integration/capabilities.test.ts`: tests covering the manifest and its capabilities.

## Notes
- `subscribe` runs once at boot, after every module is known, not at import time.
- `title` is the fallback-language column. Other languages live in `locales`' own rows.
- Erasure runs inside the caller's transaction (the `session` argument).
- The header table also lists capabilities whose files are not imported here: metrics, probes and analytics are found by name. The action endpoint, capabilities and idempotent create are wired through the route. The demo seed lives in `scenarios/example.ts`.
- The header points to `orders`, `users` and `payments` for patterns this module does not show. The header also references a "module template" section of the project's modules documentation.
