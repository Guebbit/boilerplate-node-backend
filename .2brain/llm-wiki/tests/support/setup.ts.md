---
source: tests/support/setup.ts
sha256: 36b127e720abdaa83012cd1619f00e95be4901daf38d5f08141f35a07da6a2b8
generated_at: 2026-10-29T07:11:23.741145+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup.ts

## Purpose

Global Jest `setupFiles` bootstrap that runs once per worker **before** any test module is imported. It wires up i18n resources, Zod validation messages, email template directories, a DNS stub, and test doubles at import time — because the modules under test capture their defaults during import, and a `beforeAll` would be too late.

## Key elements

- **`import './setup-environment'`** — side-effect import; writes process environment variables before any other import reads them.
- **`import '@infrastructure/runtime/mongoose-boot'`** — sets `strictQuery` before any Mongoose schema is built (affects `bulkWrite` filter behaviour).
- **`bootI18n(…, 'en')`** — loads locale dictionaries from directories globbed off disk. Async; rejection is rethrown as an unhandled rejection that Jest pins to the first test.
- **`registerValidationMessages()`** — registers Zod message thunks so validation errors resolve localised copy.
- **`registerTemplateDirectories(…)`** — registers per-module email template directories, also globbed off disk.
- **`jest.mock('node:dns/promises', …)`** — stubs `resolve4` (returns a fixed public IP) and `resolve6` (rejects `ENODATA`); rest of the module stays real via `requireActual`.
- **`registerDoubles()`** — registers fake payment provider, mail log, and outbox in `globalThis`-backed registries.

## Relationships

- **`tests/support/setup-environment.ts`** — imported first purely for its side effect (env vars must exist before the imports below evaluate).
- **`src/infrastructure/i18n/boot.ts`** — `bootI18n` is called here to load resources before any Zod schema evaluates a message thunk.
- **`src/infrastructure/http/validation-messages.ts`** — `registerValidationMessages` is called so Zod returns the project's copy, not its built-in English.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported for the `strictQuery` side effect before any model/schema loads.
- **`src/infrastructure/adapters/template-registry.ts`** — the *leaf* module is imported (not the `mailer` adapter) to register template directories without pre-evaluating `nodemailer`.
- **`scenarios/support/doubles/register.ts`** — `registerDoubles` is called to populate the global double registries before any test file's `jest.mock` is hoisted.
- **`tests/support/paths.ts`** — provides `MODULES_ROOT`, the base path used by the `readdirSync` globs for locales and templates.

## Notes

- **No database.** Mongo is per-suite via `setupTestDb()`; a pure-function test should not pay for a `mongod` spin-up.
- **Async in a sync context.** `setupFiles` cannot `await`. The `bootI18n` rejection is rethrown in the `.catch` handler, surfacing as an unhandled rejection on the first test rather than a silent fallback to raw keys.
- **Disk globbing, not module-registry import.** Directories are discovered with `readdirSync(MODULES_ROOT)` instead of importing `enabledModules`, because importing the registry would load every module before any `jest.mock` in a test file could intercept it.
- **Mailer adapter deliberately avoided.** Importing `@infrastructure/adapters/mailer` here would hand every test file an already-evaluated, un-mockable `nodemailer` reference (see `template-registry.ts` header).
- **DNS mock is per-worker, not per-test.** A test file that needs a private or failing DNS answer mocks `node:dns/promises` itself; that file-level mock wins over this global one.
