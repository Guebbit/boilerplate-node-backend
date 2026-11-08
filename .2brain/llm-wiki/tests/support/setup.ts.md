---
source: tests/support/setup.ts
sha256: 36b127e720abdaa83012cd1619f00e95be4901daf38d5f08141f35a07da6a2b8
generated_at: 2026-11-08T10:00:30.330840+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup.ts

## Purpose

Jest `setupFiles` bootstrap that runs once per worker, before any test module is imported. It wires up i18n resources, Zod validation messages, email template directories, a DNS stub, and test doubles at a time when the modules under test have not yet captured their import-time defaults. Doing this later (e.g. in `beforeAll`) would be too late for rate-limiter construction, i18n thunk resolution, and schema-level `strictQuery`.

## Key elements

- **`import './setup-environment'`** — side-effect import; writes process env vars before any subsequent import reads them.
- **`import '@infrastructure/runtime/mongoose-boot'`** — side-effect import; sets `strictQuery` before any Mongoose schema is built.
- **`bootI18n(…, 'en')`** — loads locale dictionaries from disk-globbed `locales/` directories under each module; must complete before any Zod message thunk evaluates.
- **`registerValidationMessages()`** — registers the Zod error-message thunks so validation copy matches the running service.
- **`registerTemplateDirectories(…)`** — collects per-module `templates/` directories (globbed from disk) so `templateFile()` can resolve names.
- **`jest.mock('node:dns/promises', …)`** — stubs `resolve4` to a fixed public IP and `resolve6` to reject with `ENODATA`; preserves `Resolver` and the rest of the real module. Lets webhook-URL validation tests run offline.
- **`registerDoubles()`** — registers the fake payment provider, mail log, and outbox. Doubles defer their own imports to first use, so a test file's `jest.mock` is already in place when they fire.
- **`MODULES_ROOT`** (from `@tests/paths`) — the root directory scanned for per-module `locales/` and `templates/` folders.

## Relationships

- **`tests/support/setup-environment.ts`** — imported first; its side effect (env mutation) must precede every other import in this file.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported for its side effect (sets `strictQuery` on the Mongoose connection before schema build).
- **`src/infrastructure/i18n/boot.ts`** — provides `bootI18n`, called here with the directory list.
- **`src/infrastructure/http/validation-messages.ts`** — provides `registerValidationMessages`, called here.
- **`src/infrastructure/adapters/template-registry.ts`** — provides `registerTemplateDirectories`; intentionally imported as the leaf module (not the higher-level mailer adapter) to avoid pulling in `nodemailer` before test-file mocks are hoisted.
- **`tests/support/paths.ts`** — exports `MODULES_ROOT` used to glob locale and template directories.
- **`scenarios/support/doubles/register.ts`** — provides `registerDoubles`; the registries attach to `globalThis` so they survive module resets.

## Notes

- **Async without await.** `bootI18n` returns a promise; `setupFiles` cannot `await`. The `.catch` re-throws, surfacing the failure as an unhandled rejection Jest pins to the first test rather than a silent suite running on raw keys.
- **Disk glob instead of module-registry import.** Locale and template directories are discovered via `readdirSync(MODULES_ROOT)`. Importing `enabledModules` here would execute every module's top-level code before any `jest.mock` in a test file could intercept it, silently breaking mocks across unrelated suites.
- **`nodemailer` is deliberately absent.** The import targets `template-registry.ts` (the leaf) rather than `@infrastructure/adapters/mailer`, because the latter also imports `nodemailer`, which would be evaluated and frozen before a test file's `jest.mock('nodemailer', …)` takes effect.
- **No database here.** Mongo is spun up per-suite via `setupTestDb()`; this file avoids the cost of a `mongod` for pure-function tests.
- **DNS mock is additive.** The factory spreads `jest.requireActual` first, so `Resolver` (used by MX policy checks) remains the real implementation; only `resolve4`/`resolve6` are replaced. A test that needs a different answer can override with its own `jest.mock`.
