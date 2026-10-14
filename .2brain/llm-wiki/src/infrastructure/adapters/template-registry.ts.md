---
source: src/infrastructure/adapters/template-registry.ts
sha256: 223274061909eeba2a4fef680468340350381e5e2c593a2a0e5c3c30833f4605
generated_at: 2026-10-14T07:50:28.044402+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/template-registry.ts

## Purpose

A leaf-module registry that maps EJS template names (e.g. `"invoice.receipt"`) to their absolute file paths on disk. It was deliberately split out of `mailer.ts` so that test infrastructure (`tests/support/setup.ts`, run via jest `setupFiles`) can call `registerTemplateDirectories` *before* any `jest.mock('nodemailer')` hoisting occurs — importing `mailer.ts` here would pull in a real `nodemailer` and make it un-mockable.

## Key elements

- **`registerTemplateDirectories(directories: readonly string[]): void`** — Walks each directory for `*.ejs` files, builds a name→path map (name = filename without `.ejs`), and replaces the module-level `collectedTemplates` store. Throws if two directories declare the same template name.
- **`templateFile(templateName: string): string`** — Resolves a validated name to its registered absolute path. The only place `.ejs` is appended. Throws on invalid characters or unregistered names.
- **`registeredTemplateNames(): string[]`** — Returns all collected names; consumed by tests to enumerate templates without a hand-maintained list.
- **`TEMPLATE_NAME` (regex)** — `^[\da-z][\d.a-z-]*$/i`; rejects path separators and any character outside `[a-z0-9.-]`, preventing directory traversal.
- **`collectedTemplates`** — Module-private `Record<string, string>` populated once at boot; never re-read from disk after.

## Relationships

- **`src/app.ts`** — Calls `registerTemplateDirectories` once at boot (alongside `bootI18n`), passing the collected `enabledModuleDirectories('templates')` list.
- **`src/infrastructure/adapters/mailer.ts`** — The consumer of `templateFile` when rendering a mail; this file was extracted from it to keep the import graph clean for test setup.
- **`tests/support/setup.ts`** — Imports and calls `registerTemplateDirectories` in jest's `setupFiles` so every test file sees a populated registry without importing `mailer.ts`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Iterates `registeredTemplateNames()` to render each shipped template and assert output.
- **`tests/cross-cutting/outbox-names.test.ts`** — Exercises template-name validation / resolution across the outbox contract.

## Notes

- Template names are the **wire format** across RabbitMQ (`EmailJobPayload`); the name is a bare identifier, never a path. Every process that drains the queue (API server, workers) boots the identical module list and therefore builds the identical map.
- `Object.hasOwn` is used (not bare `in` or bracket indexing) to avoid prototype-chain hits like `constructor` when a template is missing.
- The registry is populated **once** at boot; there is no runtime re-scan. Adding a new template at runtime requires a restart.
- No `ejs`, `nodemailer`, or any rendering-engine import lives here by design — this file is safe to import from any test setup context.
