---
source: src/kernel/registry.ts
sha256: 2e47c681aea7b892222ed91354728ec90631c1666fa224ad5870d49bee401899
generated_at: 2026-09-23T17:56:04.995933+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/registry.ts

## Purpose

Defines the manifest interfaces that turn the explicit module list in `src/modules.ts` into a running application. Each module declares—through these typed contracts—everything it needs the app tier to do *for* it (mount routes, drain queues, write back image digests, collect personal data, register translatable collections, validate required env vars). The design enforces a one-directional boundary: infrastructure and kernel code never import `src/modules/*`; instead, modules register declarations here and the app tier resolves them by string key.

## Key elements

- **`AppModule`** — The top-level manifest. Bundles a module's `name`, `basePath`, `routes`, `subscribe`, `locales`, `permissions`, `imageTargets`, `consumers`, `translatables`, `rawBodyPaths`, `requiredConfig`, and non-module boot checks. This is the object each `src/modules/<name>/module.ts` exports.
- **`RequiredConfig`** — A single env-var requirement (`key`, `minLength`, optional `placeholder`, optional `productionOnly`). Collected across all modules so boot failure reports every missing var at once.
- **`ImageTarget`** — A `writeback` callback the image-digest worker calls to persist `imageUrl`/`thumbnailUrl` onto a module-owned collection, guarded by a `pendingImageKey` check to make stale/duplicate deliveries no-ops.
- **`ModuleConsumer`** — Declares a queue a module drains: `queue` name, `handler` (return `true` to ack, `false` to park, throw to retry), optional `schema` (Zod) and `prefetch`. Resolved by `app/workers.ts` at boot.
- **`TranslatableTarget`** — Declares a collection + allowed `fields` + `cacheTag` for the translation resolver, which cannot import modules directly.
- **`PersonalDataSubject`** / **`PersonalDataSection`** — Identity (`userId` + `email`) and a module's `collect` callback for GDPR Art. 15/20 exports, so `account` can assemble the envelope without importing every sibling.
- **`AppModule.permissions`** — The permission keys a module introduces; cross-checked against `shared/authorization-keys.yaml` by a cross-cutting test.
- **`AppModule.rawBodyPaths`** — Paths whose request bodies must be kept as raw bytes (for signed payloads), declared here because the parser runs before the module router.

## Relationships

- **`src/modules.ts`** — The static array of `AppModule` instances; this file provides the type each entry must satisfy.
- **`src/app.ts`** — Iterates the module list: mounts `routes` at `basePath`, passes `locales` to `registerLocaleDirectories` before `i18next.init()`, applies `rawBodyPaths` to the JSON parser, calls `subscribe()`.
- **`src/app/workers.ts`** — Collects every module's `consumers` and calls `consumeFromQueue` for each; the only place that actually starts queue listeners.
- **`src/kernel/required-config.ts`** — Provides `assertRequiredConfig` and `NonModuleChecks`; `AppModule.requiredConfig` entries are fed into that assertion at boot.
- **`src/modules/account/services/personal-data-registry.ts`** — Consumes the `PersonalDataSection` entries gathered from all enabled modules to build the export envelope.
- **`src/modules/account/module.ts`**, **`src/modules/access/module.ts`**, **`src/modules/addresses/module.ts`**, **`src/modules/antibot/module.ts`**, **`src/modules/account/two-factor/registry.ts`** — Concrete modules whose `module.ts` exports an `AppModule` conforming to the interfaces defined here.

## Notes

- The docblock explicitly warns to keep `AppModule` small: a field only one module fills belongs in that module's barrel, and a field nothing reads at runtime is "a comment with extra syntax."
- `ModuleConsumer.handler` is a method (not a property) on purpose so each module's handler retains its own generated payload type rather than being widened to `unknown`.
- `ImageTarget.writeback` must return `false` (not throw) when the `pendingImageKey` guard fails—this is the intended no-op path for redelivered or superseded jobs.
- `RequiredConfig.placeholder` is optional: omit it when the shipped default is a legitimate local value rather than a stand-in.
- The file is truncated in the source snapshot; `AppModule` likely has additional fields (e.g., the non-module boot check field that returns offending variable names) not visible here.
