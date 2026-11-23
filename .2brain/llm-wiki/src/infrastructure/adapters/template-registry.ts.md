---
source: src/infrastructure/adapters/template-registry.ts
source_sha256: 19fab66680a841a91fdae7f7afe706f06b9dda65a8fe71f92cf02e57d18ae3bf
context_sha256: 21a73c7aab7cb8f7399e366cabbb9d4b48f6b71357d39b614e7f63ae4b1afb58
generated_at: 2026-11-22T02:43:16.070438+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/template-registry.ts

## Purpose
Resolves an EJS template name (e.g. `<module>.<mail-name>`) to an absolute file path. It was split out of `mailer.ts` on purpose and imports neither `ejs` nor `nodemailer`. `tests/support/setup.ts` calls `registerTemplateDirectories` from jest `setupFiles`, which runs before a test file's own `jest.mock('nodemailer', …)` is hoisted. If this logic lived in `mailer.ts`, a real `nodemailer` would be loaded first and could not be mocked.

## Key elements
- `registerTemplateDirectories(directories)` scans each directory for `*.ejs` files. It builds a name → absolute path map, where the name is the filename without `.ejs`, and replaces the module-level map. It throws if two directories declare the same template name.
- `templateFile(templateName)` is the single place where a name becomes a path. It validates the name against `TEMPLATE_NAME` (`/^[\da-z][\d.a-z-]*$/i`), which allows letters, digits, dots and dashes and no path separators. It then looks the name up in the registry and throws if the name is invalid or unregistered. The lookup uses `Object.hasOwn`, so a name like `constructor` cannot hit `Object`'s own properties.
- `registeredTemplateNames()` returns every collected name. Tests use it to render every shipped template.

## Relationships
- `src/app/boot-rendering.ts`: `bootRendering` calls `registerTemplateDirectories` once at boot, next to `bootI18n`, passing the template directories of the enabled modules.
- `src/infrastructure/adapters/mailer.ts`: this is the consumer. It resolves template names through `templateFile`. The registry lives in a separate file so `mailer.ts` stays mockable in tests.
- `tests/support/setup.ts`: calls `registerTemplateDirectories` from jest `setupFiles`.
- `tests/unit/infrastructure/adapters/mailer-templates.test.ts`: uses `registeredTemplateNames()` to walk and render every template. It checks the result against its own list.
- `tests/integration/ops-outbox-sweep-job.test.ts`: a graph neighbor of this file. The file's content shows no direct interaction with it.

## Notes
- Only the bare template name travels over RabbitMQ (`EmailJobPayload`), so the wire format is unchanged. Only the on-disk location moved, from one shared directory into the module that owns the template.
- Every process that sends mail (the app and each scheduled job) boots all modules through `bootRendering`, so each one builds the same map. The inline fallback of `enqueueEmail` also relies on this map.
- Calling `registerTemplateDirectories` again replaces the whole map. A collision throws before the map is replaced, so the previous map stays intact.
- `.ejs` is written only in this file. Template names are shared with the demo outbox and the paired frontend, which asserts on them.
