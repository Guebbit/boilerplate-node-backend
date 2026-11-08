---
source: tests/unit/infrastructure/adapters/mailer-templates.test.ts
sha256: 20c17837f379502ce1ba3602ef5c13e0885baa596c74f7232458ca5ce83425c6
generated_at: 2026-11-08T10:08:58.305741+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-templates.test.ts

## Purpose

Smoke-test that guards the email/PDF template collection. It registers the same `templates/` directories that `app.ts` resolves at boot (via `enabledModuleDirectories`), then asserts that a non-empty set of templates is registered, that known names resolve to real files on disk, that invalid or malicious names are rejected, and that every template renders through EJS with both full and minimal fixtures for each supported locale. Because it deliberately does **not** mock the filesystem, it catches broken template paths that neither the type system nor a mocked test would surface.

## Key elements

- **`registerTemplateDirectories(enabledModuleDirectories('templates'))`** — top-level call that populates the template registry identically to the production boot sequence.
- **`describe('the template collection', …)`** — three test groups:
  - Asserts at least one template is registered.
  - `it.each` over a list of known names (`orders.order-confirm`, `account.deleted`, etc.) asserting `templateFile(name)` does not throw.
  - `it.each` over path-traversal / malformed names (`../etc/passwd`, `a/b`, `a\b`, ``, `.hidden`) asserting `templateFile` throws with a "not a valid template name" message.
  - Asserts `templateFile('constructor')` throws "not a registered template" (guards against `Object.prototype` pollution).
- **`contentFor(locale)`** — returns a `Record<string, EmailContent>` mapping every template name to the output of its module builder (imported from account, api-keys, orders, payments, delivery, returns, stock-alerts, notifications, shop-tasks, tasks, example, invoicing, users). All optional inputs are supplied (full fixture).
- **`minimalContentFor(locale)`** — same shape but only for builders that have optional parameters, with those parameters omitted. Proves templates render when the optional parts are absent.
- Rendering uses `ejs` directly; locale iteration is driven by `listSupportedLocales()` from the i18n infrastructure.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — provides the `EmailContent` type and the three functions the test exercises: `registerTemplateDirectories`, `registeredTemplateNames`, `templateFile`.
- **`src/modules.ts`** — provides `enabledModuleDirectories`, the single source of truth for which module owns which `templates/` directory.
- **`src/infrastructure/i18n/index.ts` / `catalog.ts`** — provides `listSupportedLocales` used to drive per-locale render assertions.
- **Module email files** (`src/modules/account/emails.ts`, `src/modules/orders/emails.ts`, `src/modules/payments/emails.ts`, `src/modules/delivery/emails.ts`, `src/modules/returns/emails.ts`, `src/modules/api-keys/emails.ts`, `src/modules/notifications/emails.ts`, `src/modules/invoicing/emails.ts`, `src/modules/example/index.ts`, and others) — each exports the builder function whose output feeds the corresponding template render. The test imports these as the "builder that fills the template."

## Notes

- The test **never mocks the filesystem**. A broken template path (wrong folder name, missing file) is the primary failure mode it guards against, and only a real path resolution can expose it.
- Registration mirrors `app.ts` boot exactly; if you add a new module or rename a `templates/` directory, this suite fails before deployment.
- The `minimalContentFor` map is intentionally sparse: only builders with at least one optional parameter appear. If a new builder gains an optional input, a new entry is expected here.
- Template name validation is tested in-process (unit level) rather than via an HTTP boundary, since `templateFile` is the single choke-point that turns a name into a filesystem path.
