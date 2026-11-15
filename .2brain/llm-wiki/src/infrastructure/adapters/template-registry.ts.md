---
source: src/infrastructure/adapters/template-registry.ts
sha256: 19fab66680a841a91fdae7f7afe706f06b9dda65a8fe71f92cf02e57d18ae3bf
generated_at: 2026-11-14T17:55:48.198032+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/template-registry.ts

## Purpose

Leaf module that maps EJS template names to absolute file paths. It was deliberately split out of `mailer.ts` so that `tests/support/setup.ts` (run via jest `setupFiles`) can register template directories without pulling in a real `nodemailer` module that mock-based tests would then find already-evaluated and un-mockable.

## Key elements

- **`registerTemplateDirectories(directories)`** – Scans each supplied directory for `*.ejs` files and stores `name → absolute-path` in a module-level `Record`. Throws if two directories declare the same name. Called once at boot.
- **`templateFile(templateName)`** – Validates the name against a strict character set (no path separators), then looks up the registered path. The single point where a name becomes a filesystem path. Throws on invalid or unregistered names.
- **`registeredTemplateNames()`** – Returns all registered names, used by `mailer-templates.test.ts` to enumerate templates without maintaining a hardcoded list.
- **`TEMPLATE_NAME`** (internal) – Regex `^[\da-z][\d.a-z-]*$/i`; ensures names cannot contain `/`, `\`, or other characters that would escape the template directory.
- **`collectedTemplates`** (module-level `Record`) – The live name→path map, replaced wholesale by `registerTemplateDirectories`.

## Relationships

- **`src/app/boot-rendering.ts`** – Calls `registerTemplateDirectories` at boot (alongside `bootI18n`), passing the list of enabled module template directories.
- **`src/infrastructure/adapters/mailer.ts`** – Consumes `templateFile` to resolve the path for rendering; the registry was extracted from this file to keep the import graph safe.
- **`tests/support/setup.ts`** – Invokes `registerTemplateDirectories` from jest's `setupFiles` hook so every test file starts with a populated registry.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** – Iterates `registeredTemplateNames()` to render and assert on each template.
- **`tests/integration/ops-outbox-sweep-job.test.ts`** – Exercises code paths that resolve template names through the registry during outbox processing.

## Notes

- The module intentionally has **zero** imports of `ejs` or `nodemailer`. Adding one would break the `setupFiles` isolation described in the module docblock.
- `Object.hasOwn` is used (not `in` or a bare index) to guard against prototype keys like `constructor` being mistaken for a registered template.
- Template names are the **wire format** (sent over RabbitMQ as `EmailJobPayload`); only the on-disk location is resolved locally. Do not embed paths in names.
- `registerTemplateDirectories` is idempotent in the sense that a second call fully replaces the map, but the intended contract is one call at boot.
