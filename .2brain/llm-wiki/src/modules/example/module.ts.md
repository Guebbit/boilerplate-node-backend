---
source: src/modules/example/module.ts
sha256: 3909941786dd35efdeb32a619cff6fc1810469d444113b87cdd75d8825db1ba1
generated_at: 2026-11-08T05:51:04.612247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/module.ts

## Purpose
Module manifest for the `example` domain. It is explicitly a **copy-paste template**: its sole job is to be duplicated when starting a new domain and then deleted. It wires together each optional capability (events, rate limits, webhooks, translations, cover images, config, personal-data) into a single `AppModule` object the kernel can boot.

## Key elements
- **`publicEvents`** – Maps the internal `EXAMPLE_PUBLISHED` domain event to a public webhook shape (`example.published` with `exampleId`, `title`). The `webhooks` kernel projects these via the registry without importing this file by name.
- **`export default` (the manifest)** – A single object satisfying `AppModule`. Each property is one capability and can be removed independently:
  - `mounts` – mounts `router` at `/examples`.
  - `config` – registers `exampleConfig.slice`.
  - `rateLimits` – exposes `exampleRateLimits`.
  - `subscribe` – a boot-time callback that attaches `mailOwnerOfPublished` to `EXAMPLE_PUBLISHED` via `onDomainEvent`.
  - `imageTargets` – tells the image pipeline where to write back a finished cover digest (`exampleRepository.writebackImage`).
  - `translatables` – declares `title` as the translatable field on the `examples` collection.
  - `personalData` – provides `collect` and `erase` callbacks for GDPR export/erasure.
  - `locales` / `templates` – filesystem paths for i18n strings and mail templates.

## Relationships
- **`src/kernel/registry.ts`** – source of the `AppModule` and `PublicEventTarget` types that shape the manifest.
- **`src/kernel/events.ts`** – provides `onDomainEvent` and `DomainEventMap` used inside `subscribe`.
- **`src/modules.ts`** – the barrel that discovers and registers this module at boot.
- **`src/modules/example/config.ts`** – supplies `exampleConfig`.
- **`src/modules/example/events.ts`** – defines the `EXAMPLE_PUBLISHED` constant.
- **`src/modules/example/services/notify.ts`** – supplies the `mailOwnerOfPublished` handler.
- **`src/modules/example/services/personal-data.ts`** – supplies `collectPersonalData` / `eraseForUser`.
- **`src/modules/example/services/cover.ts`** – supplies `EXAMPLE_IMAGE_COLLECTION` and the cover pipeline.
- **`src/modules/example/rate-limits.ts`** – supplies `exampleRateLimits`.
- **`src/modules/example/repository.ts`** – supplies `exampleRepository` (write-back, translatable helpers).
- **`src/modules/example/routes.ts`** – supplies the Express `router` mounted at `/examples`.
- **`src/modules/example/asyncapi.webhooks.yaml`** – the webhooks catalogue that `publicEvents` feeds into.
- **`src/modules/example/tests/integration/capabilities.test.ts`** – integration tests exercising the wired-up capabilities.

## Notes
- **Template, not production code.** The header comment states it should be copied into a new domain and then removed; the `example` domain has no real business logic beyond a note with an owner and a draft/published/archived lifecycle.
- **`subscribe` runs at boot, not at import time.** The kernel invokes it after all modules are known, so cross-module event ordering is safe.
- **Translation convention:** `title` is the fallback-language column; other languages live in the `locales` directory (referenced by the `locales` path), not in the same row.
- **Dependencies are one-directional:** this module depends on `users` (via its barrel) only for the owner's name; nothing else in the codebase imports `example`.
