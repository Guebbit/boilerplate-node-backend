---
source: src/modules/example/module.ts
sha256: d6c104121192b8b4a1e2f8e7d8a7223f29d5c9d382de2286be0d9144030480bb
generated_at: 2026-11-14T19:59:29.650573+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/module.ts

## Purpose

The manifest entry for the `example` module. It is a **template**: every capability the module wants the application to provide (event subscriptions, rate limits, webhook projections, image writeback, translations, personal-data export/erasure, routes) is declared here in one object, and the supporting files for each capability live alongside. The file's stated job is to be copied when starting a new domain and then deleted. Nothing in the codebase depends on it; it depends on `users` (via its barrel) only for the owner's name.

## Key elements

- **Default export** (`satisfies AppModule`) — the single object the application reads at boot. Fields:
  - `name` — `'example'`, used for routing, config keys, and registry lookups.
  - `mounts` — mounts the Express `router` from `src/modules/example/routes.ts` at `/examples`.
  - `config` — registers the `exampleConfig` namespace from `src/modules/example/config.ts`.
  - `rateLimits` — applies rules from `src/modules/example/rate-limits.ts`.
  - `publicEvents` — maps the internal `EXAMPLE_PUBLISHED` domain event to a webhook-visible `example.published` shape.
  - `subscribe` — **boot-time** callback (not import-time) that wires `EXAMPLE_PUBLISHED → mailOwnerOfPublished` via `onDomainEvent`.
  - `imageTargets` — tells the image pipeline where to write a finished digest back (`exampleRepository.writebackImage`), keyed by `EXAMPLE_IMAGE_COLLECTION`.
  - `translatables` — declares the `example` collection's translation rules, cache tag, and field rules (from `src/modules/example/model.ts`).
  - `personalData` — GDPR-style `collect` / `erase` handlers (from `src/modules/example/services/personal-data.ts`); erasure runs inside a transaction.
  - `locales` / `templates` — filesystem paths (relative to this file) for i18n strings and mail templates.

- **`publicEvents`** (local const) — the only webhook surface; the kernel's registry projects it, so downstream consumers never import this module by name.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Provides the `AppModule` and `PublicEventTarget` **types** the manifest satisfies; at runtime the registry discovers this module by name. |
| `src/kernel/events.ts` | Provides `onDomainEvent` (used inside `subscribe`) and the `DomainEventMap` type for typing the webhook payload. |
| `src/modules.ts` | The module barrel; the doc comment says `example` is reached *through* the `users` barrel for the owner's name, but no runtime import of this file is visible here. |
| `src/modules/example/config.ts` | Exports `exampleConfig` consumed by the `config` manifest entry. |
| `src/modules/example/events.ts` | Exports the `EXAMPLE_PUBLISHED` symbol used in `publicEvents` and `subscribe`. |
| `src/modules/example/services/cover.ts` | Exports `EXAMPLE_IMAGE_COLLECTION` used as the key in `imageTargets`. |
| `src/modules/example/services/notify.ts` | Exports `mailOwnerOfPublished`, the handler registered in `subscribe`. |
| `src/modules/example/services/personal-data.ts` | Exports `collectPersonalData` and `eraseForUser` for the `personalData` entries. |
| `src/modules/example/rate-limits.ts` | Exports `exampleRateLimits`. |
| `src/modules/example/model.ts` | Exports `exampleTranslationFieldRules` spread into `translatables`. |
| `src/modules/example/repository.ts` | Exports `exampleRepository` (provides `writebackImage` and `translatable` helpers). |
| `src/modules/example/routes.ts` | Exports the Express `router` mounted at `/examples`. |
| `src/modules/example/module.yaml` | Declarative companion referenced in the doc comment; not directly `import`ed by this TS file. |
| `src/modules/example/authorization.yaml` | Declarative auth rules companion; not directly `import`ed by this TS file. |
| `src/modules/example/asyncapi.webhooks.yaml` | Webhook catalogue companion referenced in the doc comment; not directly `import`ed by this TS file. |

## Notes

- **Template, not production code.** The doc comment explicitly says to copy, customise, then delete. Treat every import here as a "delete me once you're done" marker.
- **`subscribe` is deferred.** It is a closure invoked by the kernel *after* all modules are registered, not at module-evaluation time. Do not assume side-effects fire at import.
- **`title` is the fallback-language column.** Other-language values live in the `locales` table; the `translatables` entry wires the translation pipeline to that split.
- **Personal-data erasure is transactional.** `eraseForUser` receives a `session` (transaction handle) and must commit/abort within it.
- **Public events are one-directional.** The kernel registry reads `publicEvents` to project webhooks; this file never imports the registry at runtime (types only), so there is no circular dependency.
