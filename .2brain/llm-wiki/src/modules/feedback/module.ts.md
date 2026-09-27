---
source: src/modules/feedback/module.ts
sha256: 53d2d57f347e28653b413c8ad2d787e7236b13c8aae3c3aba67d78f3864ee78f
generated_at: 2026-09-27T14:52:49.929641+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/module.ts

## Purpose

Module manifest for the **feedback** (contact-form) module. It registers the module's routes, permissions, rate-limit budgets, personal-data export hook, and locale path into the app's `AppModule` contract. The form is deliberately open to people with no account, so records store an email address rather than a user ID.

## Key elements

- **Default export** — an `AppModule` object satisfying the `@kernel/registry` type. Fields: `name: 'feedback'`, `basePath: '/feedback'`, `permissions`, `routes`, `rateLimits`, `personalData`, `locales`.
- **`permissions`** — `['feedback.any.read', 'feedback.any.update', 'feedback.any.delete']`. Enforced by a cross-cutting test (`tests/cross-cutting/module-permissions.test.ts`) that rejects keys orphaned from or unclaimed by this module.
- **`routes`** — re-exported from `./routes` (`router`).
- **`rateLimits`** — re-exported from `./rate-limits` (`feedbackRateLimits`).
- **`personalData[0].collect`** — gated behind the `NODE_EXPORT_INCLUDE_FEEDBACK` env flag (default `false`). When on, calls `findOwnTicketsForExport(subject.email)` from `./service`; when off, resolves to `undefined` so the downstream `account` assembly omits the `feedback` key entirely.
- **`locales`** — resolved via `path.join(__dirname, 'locales')`.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type this manifest must `satisfy`.
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentFlag`, used to gate the personal-data export.
- **`src/modules.ts`** — top-level module aggregator that includes this module.
- **`src/modules/feedback/routes.ts`** — defines the `router` mounted under `/feedback`.
- **`src/modules/feedback/rate-limits.ts`** — defines `feedbackRateLimits` consumed here.
- **`src/modules/feedback/service.ts`** — defines `findOwnTicketsForExport` used by the `collect` callback.
- **`src/modules/feedback/openapi.yaml`** — OpenAPI spec describing this module's public API surface.

## Notes

- `collect` returns `undefined` (not `[]`) when the flag is off. This is intentional: the `feedback` key is *optional* in the export contract, and most exports carry no feedback data. Returning an empty array would still emit the key.
- Because the form stores email (not user ID), deleting a user account does **not** cascade-delete their feedback records. The doc comment labels this module "a leaf in both directions" — no other module imports from it, and it imports no other module's services.
- The `satisfies AppModule` check is compile-time only; the object shape must also align with runtime expectations in the registry.
