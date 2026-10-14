---
source: src/modules/feedback/module.ts
sha256: f22269e1c5504cf476f97286c52dc17afce151a1003ae5987a70ef7874b64b67
generated_at: 2026-10-14T15:50:05.615049+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/module.ts

## Purpose

Module manifest for the feedback (contact-form) feature. It assembles the router, rate limits, config, and personal-data exporter into a single `AppModule` object that the kernel registry consumes to mount routes, register budgets, and wire GDPR export under the `feedback.*` key.

## Key elements

- **`default` (export)** — An object satisfying `AppModule` with:
  - `name: 'feedback'`, `basePath: '/feedback'`
  - `routes` — the Express/Fastify router from `./routes`
  - `config` — `feedbackConfig.slice`, making the module's config keys namespaced as `feedback.*`
  - `rateLimits` — `feedbackRateLimits` (contact-form submission budgets)
  - `personalData[0].collect` — Returns the subject's feedback tickets for data export, gated on **both** `NODE_EXPORT_INCLUDE_FEEDBACK` and `subject.emailVerified`. Returns `Promise<undefined>` (not an empty array) when either condition is unmet, causing the `account` assembler to omit the key entirely.
  - `locales` / `templates` — Resolved to `__dirname`-relative paths for i18n strings and view templates.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type the manifest must satisfy; the registry reads this manifest to mount the module.
- **`src/modules.ts`** — Top-level module barrel that imports and aggregates this manifest.
- **`src/modules/feedback/routes.ts`** — Source of the `router` attached to the manifest.
- **`src/modules/feedback/rate-limits.ts`** — Source of `feedbackRateLimits` (per-IP / per-email budgets for the public form).
- **`src/modules/feedback/config.ts`** — Source of `feedbackConfig` (runtime config including `NODE_EXPORT_INCLUDE_FEEDBACK`).
- **`src/modules/feedback/service.ts`** — Source of `findOwnTicketsForExport`, used by the `personalData.collect` callback.
- **`src/modules/feedback/openapi.yaml`** — OpenAPI contract for the endpoints mounted by `routes.ts`.
- **`src/modules/feedback/tests/integration/export.test.ts`** — Integration tests exercising the export path defined in `personalData.collect`.

## Notes

- The feedback module is intentionally **account-less**: records are keyed by email, not user ID. Deleting a user account does **not** cascade-delete their feedback.
- `collect` returns `undefined` (not `[]`) to signal "omit this section" to the account-export assembler — an empty array would incorrectly include an empty `feedback: []` key in the contract.
- The `emailVerified` check exists because the form is open to anyone; without it, an attacker could sign up with a victim's email and trigger export of that email's tickets.
- The module is a **leaf** in the dependency graph: it references no other module's domain objects.
