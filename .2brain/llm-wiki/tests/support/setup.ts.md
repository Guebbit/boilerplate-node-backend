---
source: tests/support/setup.ts
sha256: af5eb4833e5e39917112d074ec752eb72ec07c818a412d5701feba1e118abf8c
generated_at: 2026-10-15T13:02:11.748762+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup.ts

## Purpose

Global Jest bootstrap executed via `setupFiles` — once per worker, **before** any test module is imported. It exists because several infrastructure modules (i18n, Zod validation messages, template registry, Mongoose options) capture their configuration at import time, so wiring must happen earlier than any `beforeAll` hook would allow.

## Key elements

- **`import './setup-environment'`** — first import, pure side-effect: writes process env vars that later imports read.
- **`import '@infrastructure/runtime/mongoose-boot'`** — sets `strictQuery` before any schema is built.
- **`bootI18n(localesDirs, 'en')`** — loads i18next resources by globbing `MODULES_ROOT/*/locales` from disk (filtered with `existsSync`). Fire-and-forget (`void`).
- **`registerValidationMessages()`** — hooks i18n thunks into Zod so validation errors carry translated copy.
- **`registerTemplateDirectories(templatesDirs)`** — collects `MODULES_ROOT/*/templates` on disk so `templateFile()` can resolve names later.
- **`jest.mock('node:dns/promises', …)`** — stubs `resolve4` (returns a fixed IPv4) and `resolve6` (rejects) so webhook-URL checks never hit a real resolver; rest of the module stays real.
- **`registerDoubles()`** — registers the fake payment provider, mail log, and outbox in `globalThis`-attached registries.

## Relationships

- **`tests/support/setup-environment.ts`** — imported first for its side effect; must complete before any subsequent import reads env.
- **`tests/support/paths.ts`** — supplies `MODULES_ROOT` used by both disk globs.
- **`src/infrastructure/i18n/boot.ts` / `src/infrastructure/i18n/index.ts`** — provides `bootI18n`; must finish (resources loaded) before any Zod schema evaluates a message thunk.
- **`src/infrastructure/http/validation-messages.ts`** — `registerValidationMessages()` binds the i18n thunks to Zod.
- **`src/infrastructure/adapters/template-registry.ts`** — `registerTemplateDirectories()` populates the lookup; the *leaf* module is imported deliberately (not the higher-level mailer barrel) to avoid eagerly evaluating `nodemailer` before a test's mock is hoisted.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — side-effect import that pins `strictQuery` ahead of schema construction.
- **`scenarios/support/doubles/register.ts`** — `registerDoubles()` populates global registries; each double lazily loads its dependencies on first call, after test-file mocks are already in place.

## Notes

- **No database here.** Mongo is per-suite via `setupTestDb()`; spinning up mongod for a pure-function test is unnecessary cost.
- **Disk globs, not `enabledModules`.** Importing the module registry would load every module before any test-file `jest.mock` could intercept it, silently breaking mocks in unrelated suites. A `readdirSync` glob is layout knowledge, not application knowledge.
- **Leaf import for template registry.** `@infrastructure/adapters/mailer` (the barrel) also pulls in `nodemailer`; importing it in `setupFiles` would hand every test file an already-evaluated, un-mockable `nodemailer`.
- **DNS mock is overridable.** A test file's own `jest.mock('node:dns/promises', …)` is hoisted by Jest and wins over this global registration.
- **`bootI18n` is async but fire-and-forget.** Under Jest the promise resolves before module-scope `t()` calls execute, so eager Zod messages work; copy that must resolve at *parse* time (validation messages) is wrapped in a thunk for that reason.
