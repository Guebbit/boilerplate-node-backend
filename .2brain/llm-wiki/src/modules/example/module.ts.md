---
source: src/modules/example/module.ts
sha256: 3909941786dd35efdeb32a619cff6fc1810469d444113b87cdd75d8825db1ba1
generated_at: 2026-10-29T03:53:35.068090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/module.ts

## Purpose

Template module manifest that declares every capability a domain module can opt into (events, rate limits, webhooks, translations, image targets, personal-data hooks, etc.) in a single `AppModule` object. It exists to be copied when bootstrapping a new domain and deleted once the new module has its own manifest. Its only concrete behavior is a small "note" resource with a draft → published → archived lifecycle.

## Key elements

- **`publicEvents`** — Maps the internal `EXAMPLE_PUBLISHED` domain event to the outward-facing `example.published` webhook shape (id + title only).
- **`export default` (the manifest)** — An `AppModule` object listing:
  - `mounts` — mounts `router` at `/examples`.
  - `config` — registers `exampleConfig` for typed settings.
  - `rateLimits` — exposes `exampleRateLimits`.
  - `subscribe` — boot-time hook that wires `EXAMPLE_PUBLISHED` → `mailOwnerOfPublished`.
  - `imageTargets` — tells the image pipeline to write the finished digest back via `exampleRepository.writebackImage`.
  - `translatables` — declares `title` as the translatable field on the `examples` collection.
  - `personalData` — declares collect/erase handlers for GDPR export & erasure.
  - `locales` / `templates` — filesystem paths for i18n and mail templates.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` and `PublicEventTarget` types; the registry projects `publicEvents` to the webhook catalogue without importing this file by name.
- **`src/kernel/events.ts`** — Provides `onDomainEvent` and `DomainEventMap`, used inside `subscribe` to listen for `EXAMPLE_PUBLISHED`.
- **`src/modules.ts`** — Imports this module's default export to register it during boot.
- **`./config.ts`**, **`./events.ts`**, **`./rate-limits.ts`**, **`./repository.ts`**, **`./routes.ts`** — Imported for their respective manifest entries.
- **`./services/cover.ts`** — Provides `EXAMPLE_IMAGE_COLLECTION` used as the `imageTargets` key.
- **`./services/notify.ts`** — Provides `mailOwnerOfPublished`, the subscriber handler.
- **`./services/personal-data.ts`** — Provides `collectPersonalData` / `eraseForUser` for the `personalData` entry.
- **`tests/…`** — `manifest.test.ts` validates the manifest shape; `capabilities.test.ts` and cross-cutting/integration tests exercise the declared hooks.

## Notes

- `subscribe` is **deferred**: the framework calls it once at boot after all modules are known, not at import time. Do not add side-effectful logic at module top level.
- This file is a **template**. The doc-comment table maps each optional capability to its files and manifest key so a contributor can delete an entire capability by removing the listed files *and* the corresponding manifest property.
- The module depends on `users` (via its barrel) only for the owner's display name; nothing upstream depends on this module.
- `title` is the **fallback-language** column; per-locale strings live in the `locales` table, not alongside the main row.
