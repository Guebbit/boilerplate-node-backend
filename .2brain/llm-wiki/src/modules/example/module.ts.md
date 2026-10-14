---
source: src/modules/example/module.ts
sha256: 1c4d4e8d592791e8f6ff1bdc90f398899120df637d9c22f73abf20507ba57e67
generated_at: 2026-10-14T15:43:02.573130+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/module.ts

## Purpose

The module entry-point and manifest for the `example` domain. It declares every capability the application should wire up on the module's behalf (routes, config, rate limits, webhooks, translations, image pipeline, personal-data handlers). Its sole production role is to serve as a copy-paste template for new domains; it is expected to be deleted once a real module replaces it.

## Key elements

- **`publicEvents`** – Maps internal domain events (`EXAMPLE_PUBLISHED`) to webhook-visible public events with a stable `eventType` string and a reduced `data` payload.
- **`export default { … } satisfies AppModule`** – The manifest object. Each key is an optional capability that can be removed independently:
  - `name` / `basePath` / `routes` – routing identity.
  - `config` – typed setting descriptors from `./config`.
  - `rateLimits` – rate-limit rules from `./rate-limits`.
  - `subscribe()` – deferred event subscription (executed at boot, **not** at import time).
  - `imageTargets` – tells the image pipeline where to write finished digests, keyed by collection name.
  - `translatables` – per-collection i18n field list, cache tag, and repository callbacks for existence, derived writes, and edit marking.
  - `personalData` – GDPR collect/erase function pairs, executed inside the caller's transaction.
  - `locales` / `templates` – filesystem paths (relative to this file) for translation files and email/notification templates.

## Relationships

- **`src/kernel/registry.ts`** – Provides the `AppModule` and `PublicEventTarget` types; the registry projects `publicEvents` into the webhook catalogue without importing this file by name.
- **`src/kernel/events.ts`** – Supplies `onDomainEvent` (used inside `subscribe`) and the `DomainEventMap` type for typing event payloads.
- **`src/modules.ts`** – Barrel that imports this module's default export so the application can iterate all manifests at boot.
- **`src/modules/example/config.ts`** – Source of `exampleConfig` (typed setting descriptors).
- **`src/modules/example/events.ts`** – Defines `EXAMPLE_PUBLISHED`, the domain-event constant used for both the webhook mapping and the subscription.
- **`src/modules/example/rate-limits.ts`** – Source of `exampleRateLimits`.
- **`src/modules/example/repository.ts`** – Provides `exampleRepository` whose methods back `imageTargets.writeback`, `translatables.exists`/`writeDerived`/`markEdited`.
- **`src/modules/example/routes.ts`** – Exports the `router` mounted under `basePath`.
- **`src/modules/example/services/cover.ts`** – Exports `EXAMPLE_IMAGE_COLLECTION` (the collection key for image targets).
- **`src/modules/example/services/notify.ts`** – Exports `mailOwnerOfPublished`, the handler wired up in `subscribe`.
- **`src/modules/example/services/personal-data.ts`** – Exports `collectPersonalData` and `eraseForUser` for the `personalData` manifest entry.
- **`src/modules/example/tests/unit/manifest.test.ts`** – Unit-tests the manifest shape and capability wiring.
- **`src/modules/example/tests/integration/capabilities.test.ts`** – Exercises the full capability surface end-to-end.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** – Verifies that `publicEvents` produces the expected webhook payload shape.

## Notes

- **Template, not product.** The file's doc-comment states explicitly: copy it for a new domain, then delete it. Do not build logic that imports this module directly.
- **`subscribe` is deferred.** The function is stored on the manifest and invoked by the kernel after all modules are registered; it is *not* called at import time. This ordering matters for cross-module event visibility.
- **`translatables.fields` lists only the fallback-language column** (`title`); other languages are stored in separate `locales` rows managed by the same repository callbacks.
- **`personalData.erase` runs inside the caller's transaction.** The repository's `eraseForUser` must not commit independently.
