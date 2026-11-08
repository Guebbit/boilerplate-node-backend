---
source: src/infrastructure/adapters/template-registry.ts
sha256: 223274061909eeba2a4fef680468340350381e5e2c593a2a0e5c3c30833f4605
generated_at: 2026-11-08T03:24:29.283219+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/template-registry.ts

## Purpose

Resolves a bare EJS template name (the wire format that travels through RabbitMQ in `EmailJobPayload`) to an absolute file path on disk. It exists as a separate leaf module—deliberately free of any `ejs` or `nodemailer` import—so that Jest's `setupFiles` can call into it before test-file mocks are hoisted, without accidentally pulling in the real `nodemailer` and making it un-mockable.

## Key elements

- **`collectedTemplates`** (module-level `Record<string, string>`) — the in-memory name → absolute-path map, rebuilt atomically on each call to `registerTemplateDirectories`.
- **`registerTemplateDirectories(directories)`** — scans each directory for `*.ejs` files, builds the name → path map, and throws if two modules declare the same template name. Called once at boot.
- **`templateFile(templateName)`** — validates the name against the `TEMPLATE_NAME` regex, then looks it up in `collectedTemplates`. The single point where `.ejs` is appended and the identifier becomes a filesystem path. Throws on invalid characters or unregistered names.
- **`registeredTemplateNames()`** — returns the list of all collected names; used by tests to enumerate what the build ships without hand-maintaining a parallel list.
- **`TEMPLATE_NAME`** (`/^[\da-z][\d.a-z-]*$/i`) — enforces that a name contains no path separators or other characters that could escape the lookup directory.

## Relationships

- **`src/app.ts`** — calls `registerTemplateDirectories` at boot (alongside `bootI18n`), passing the collected `enabledModuleDirectories('templates')` values.
- **`src/infrastructure/adapters/mailer.ts`** — the original home of this logic; after the split, `mailer.ts` imports `templateFile` (and likely `registeredTemplateNames`) to resolve names at render time, while keeping its own `ejs`/`nodemailer` imports isolated.
- **`tests/support/setup.ts`** — imports `registerTemplateDirectories` via Jest's `setupFiles`, ensuring the template map is populated before any test body (and before any `jest.mock`) runs.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — calls `registeredTemplateNames()` to drive its per-template render assertions, avoiding a hard-coded list that could drift from the actual modules.

## Notes

- The name travels over the wire as a **bare filename** (no extension, no path); only the lookup here reintroduces `.ejs`. This keeps the RabbitMQ payload backend-agnostic.
- `Object.hasOwn` is used instead of `in` or a bare index guard to prevent `constructor` / `__proto__` from resolving to `Object`'s own properties.
- `collectedTemplates` is module-level mutable state with no reset helper; calling `registerTemplateDirectories` again replaces it wholesale. Tests rely on `setup.ts` running it exactly once per Jest module registry.
- The regex allows a leading digit (`/^\d[\w-]*$/i`), so names like `2fa-otp` are valid, but a name starting with a dot or dash is rejected.
