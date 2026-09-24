---
source: src/modules/feedback/module.ts
sha256: 107b76629e3c0b04f812c5a56a59328e744154f7a4962233ddfa02e0d02e6a9d
generated_at: 2026-09-23T18:40:16.161874+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/module.ts

## Purpose

Module manifest for the public contact/feedback form. Registers the module's identity, routes, permissions, rate limits, and personal-data export hooks with the kernel so the application can wire it up generically. The form is intentionally account-agnostic (no user reference), making this a leaf node in the module graph.

## Key elements

- **`toExportFeedback(ticket)`** – Maps a raw ticket document to the `ExportFeedbackTicket` shape. Explicitly omits `adminNotes` (staff-internal field, protected under Art. 15(4) "rights of others"). Returns a plain object rather than relying on a narrower type annotation, because the Mongoose document's own `toJSON()` would still serialize the field.
- **Default export (`AppModule`)** – The manifest object:
  - `name: 'feedback'`, `basePath: '/feedback'`
  - `permissions` – three keys (`feedback.any.read/update/delete`) owned by this module; cross-cutting tests enforce that a key in the shared permission file must be attributed to a live module.
  - `routes` – the Express router from `./routes.ts`.
  - `rateLimits` – contact-form budgets from `./rate-limits.ts`.
  - `personalData[0].collect` – GDR Art. 15 export hook. Gated behind `NODE_EXPORT_INCLUDE_FEEDBACK`; when the flag is off it resolves `undefined` so the `account` module omits the key entirely (the contract marks `feedback` as optional). When on, it calls `findOwnTickets(email)` and maps each ticket through `toExportFeedback`.
  - `locales` – path to `./locales` directory.
- Satisfies the `AppModule` interface from `@kernel/registry`, which is what allows `src/modules.ts` to aggregate it.

## Relationships

- **`src/kernel/registry.ts`** – Provides the `AppModule` type that the default export must satisfy; the registry consumes this manifest during application bootstrap.
- **`src/modules.ts`** – Imports this default export and includes it in the module list assembled for the kernel.
- **`src/modules/feedback/routes.ts`** – Source of the `router` attached to the manifest.
- **`src/modules/feedback/rate-limits.ts`** – Source of the `feedbackRateLimits` budget definitions.
- **`src/modules/feedback/service.ts`** – Source of `findOwnTickets`, used inside the `personalData` export collector.
- **`src/infrastructure/runtime/environment.ts`** – Provides `environmentFlag`, which gates whether feedback tickets are included in a user's data export.
- **`src/types/index.ts`** – Defines the `ExportFeedbackTicket` shape that `toExportFeedback` must return.
- **`src/modules/feedback/openapi.yaml`** – Documents the public contract for the `/feedback` routes registered by this manifest.

## Notes

- `adminNotes` is dropped at runtime (spread into a new object), not merely at the type level. A type-level `Omit` alone would be insufficient because the Mongoose document serializes the field via its own `toJSON()`.
- The `personalData` collector matches by **email**, not by user ID, because submitters may have no account.
- When `NODE_EXPORT_INCLUDE_FEEDBACK` is off, the collector resolves `undefined` (not `[]`), which causes the upstream `account` assembly to omit the `feedback` key from the export entirely — the contract deliberately types it as optional since most users will have no tickets.
- Deleting this module (removing it from `src/modules.ts`) must also remove its three permission keys from the shared permission file, or the cross-cutting test `tests/cross-cutting/module-permissions.test.ts` will fail.
