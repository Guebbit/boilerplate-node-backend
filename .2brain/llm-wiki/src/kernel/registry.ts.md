---
source: src/kernel/registry.ts
sha256: 440bcde2c41be5eaced80db551d6742776359983f27f4e081c627543dd2906ea
generated_at: 2026-09-27T14:19:47.412912+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/registry.ts

## Purpose

Defines the typed manifest contract (`AppModule`) and all supporting interfaces that a module uses to declare its runtime needs (config, image writeback, queue consumers, translation targets, public events, personal-data sections) to the application tier. It exists so that infrastructure adapters and sibling modules never need to import `src/modules/*` directly; instead the app tier collects every module's declarations and wires them up, preserving the one-directional dependency boundary enforced by ESLint.

## Key elements

- **`RequiredConfig`** — one env-var requirement (key, minLength, optional placeholder, optional productionOnly). Modules list their needs here so `registerModules` can report every missing variable in a single boot failure.
- **`ImageTarget`** — a `writeback(documentId, key, urls)` callback a module registers so the image-digest worker can persist `imageUrl`/`thumbnailUrl` without importing the module's repository. The guard on `pendingImageKey` makes stale/duplicate redeliveries no-ops.
- **`ModuleConsumer`** — a queue-name + `handler` + optional `schema`/`prefetch` declaration. `app/workers.ts` collects these and calls `consumeFromQueue`; the module never invokes the broker itself. `handler` is a method (not a property) so each module keeps its own generated payload type.
- **`TranslatableTarget`** — `collection`, `exists`, `fields`, `cacheTag`, and `writeDerived`. Lets the translation resolver validate, cache-invalidate, and write a derived column without resolving the target's Mongoose model by collection name.
- **`PublicEventProjection` / `PublicEventTarget`** — maps a domain event payload (typed `never` for registry storage) to a public webhook event name + data, or `undefined` to suppress. `webhooks/services/publish.ts` subscribes generically via the collected list.
- **`PersonalDataSubject` / `PersonalDataSection`** — GDPR Art. 15/20: each module declares a `section` key, a `collect` function, and an optional `erase` (must accept a `ClientSession` for transactional deletes). The account module assembles the export from all sections.
- **`AppModule`** — the top-level manifest interface a module exports from its `module.ts`. Carries `name`, router-mount info, and the keyed sub-interfaces above (`imageTargets`, `consumers`, `translatables`, `publicEvents`, personal-data sections, `requiredConfig`, `rateLimitBudget`, etc.). The file is truncated; not every field is visible here.

## Relationships

- **`src/modules.ts`** — the explicit, statically-typed list of `AppModule` values. This registry is the type system that turns that list into a running application.
- **`src/app.ts`** — calls `registerModules`, collects every module's declarations, and mounts routers / wires callbacks. The app tier is the only place that may refuse boot.
- **`src/app/workers.ts`** — iterates the `consumers` field on each `AppModule` and calls `consumeFromQueue` for each, after deciding whether the broker is enabled.
- **`src/kernel/required-config.ts`** — provides `assertRequiredConfig` and the `NonModuleChecks` type imported here; the kernel-level config assertion that runs before any module's `RequiredConfig` list is checked.
- **`src/app/required-config.ts`** — app-tier config; complements the per-module `RequiredConfig` entries.
- **`scripts/setup/required-keys.ts`** — setup script that likely validates the union of all modules' `RequiredConfig` entries against a `.env` file.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — consumes the `RateLimitBudget` field (imported from `@types`) on each module's manifest to generate documentation.
- **`scripts/ops/reap-inactive-accounts.ts`, `sweep-order-effects.ts`, `sweep-reservations.ts`** — ops scripts that resolve a specific module by name from the registry to reach its services for bulk maintenance.
- **`src/modules/account/module.ts`** — a concrete module whose manifest exercises `PersonalDataSection`, `RequiredConfig`, and other fields defined here.
- **`src/modules/account/services/personal-data-registry.ts`** — implements the `PersonalDataSection` shape for the account domain.
- **`src/modules/account/services/two-factor.ts` / `two-factor/registry.ts`** — module-internal registries that build on the same "declare, don't import" pattern.
- **`src/modules/access/module.ts`** — another module consuming this registry contract.

## Notes

- The file is a **type-only module** for most of its surface: every export shown is an `interface`. The sole runtime import is `assertRequiredConfig` from `@kernel/required-config`, used inside `registerModules` (below the truncation point).
- **`never` as a payload parameter** (`PublicEventTarget.toPublicEvent`, and by extension any per-event handler map) is a deliberate assignability trick: a function typed to a concrete payload is assignable into a `(payload: never) => …` slot, so the registry stays generic while the owning module keeps full type safety at its own call site.
- **`handler` as a method, not a property**, on `ModuleConsumer`: required so each module's distinct generated job-payload type is preserved; a property function type would collapse all handlers to `unknown`.
- **`PersonalDataSection.erase` is optional** while `collect` is not: a module whose data lives in the same collection as its owner skips `erase` entirely; `resolvePersonalDataErasers` skips missing entries rather than calling a no-op.
- The docblock states the guiding rule explicitly: *"a field only one module ever fills belongs behind that module's own barrel, and a field nothing reads at runtime is a comment with extra syntax."* When adding a field to `AppModule`, verify at least two modules use it and something in the app/infrastructure tier reads it.
